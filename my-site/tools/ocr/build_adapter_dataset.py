#!/usr/bin/env python3
"""
Step C — Linear adapter 학습 데이터 빌드.

라벨 JSON (cell + matchedItemId) → 학습 input:
  - cell_embed_i  : 224×224 RGB → DINOv2-small CLS embedding (384-dim, L2 normalized)
  - icon_embed_i  : SchaleDB 아이콘 + 게임 BG 합성 → 동일 모델로 embedding
  - label_i       : items.json 의 SchaleDB key (예: "item:9998")

학습 시 cell_embed 를 anchor, icon_embed 를 positive 로 사용. negative 는
인덱스 embed.bin (전체 1253 × 384) 에서 in-batch sampling.

사용법:
  python build_adapter_dataset.py \\
    --labels ../../data/labels/labels-1.json ../../data/labels/labels-2.json ... \\
    --index ../../public/ocr \\
    --out ../../data/adapter

출력:
  out/pairs.npz — { cell_embeds (N×384), icon_embeds (N×384), keys (N), label_names (N) }
  out/index_embeds.npy — 1253×384 (인덱스 전체 embed, negative pool)
  out/index_meta.json — 1253 keys list
"""

from __future__ import annotations

import argparse
import base64
import json
import logging
import os
import sys
from io import BytesIO
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

# stderr 로그
logging.basicConfig(stream=sys.stderr, level=logging.INFO, format="[%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

# DINOv2-small (브라우저용 Xenova/dinov2-small 과 동일 facebook/dinov2-small)
DINOV2_MODEL = "facebook/dinov2-small"
EMBEDDING_INPUT_SIZE = 224
EMBEDDING_DIM = 384

# 게임 BG (build_index.ts 와 일치)
GAME_BG = (215, 225, 229)


def load_dinov2():
    """Lazy 로드 — 학습 / 데이터 빌드 모두 동일 모델."""
    log.info(f"DINOv2 로드: {DINOV2_MODEL}")
    import torch
    from transformers import AutoImageProcessor, AutoModel

    processor = AutoImageProcessor.from_pretrained(DINOV2_MODEL)
    model = AutoModel.from_pretrained(DINOV2_MODEL).eval()
    return processor, model


def extract_cell_image(cell_data_url: str) -> Image.Image | None:
    """Label 의 cellDataUrl → PIL RGB Image (원본 셀 크기)."""
    try:
        b64 = cell_data_url.split(",", 1)[1]
        buf = base64.b64decode(b64)
        img = Image.open(BytesIO(buf)).convert("RGB")
        return img
    except Exception as e:
        log.warning(f"cell decode 실패: {e}")
        return None


def composite_icon(rgba: Image.Image) -> Image.Image:
    """SchaleDB 투명 PNG → 게임 BG 합성 RGB 224×224."""
    rgba = rgba.convert("RGBA").resize((EMBEDDING_INPUT_SIZE, EMBEDDING_INPUT_SIZE), Image.BILINEAR)
    bg = Image.new("RGB", rgba.size, GAME_BG)
    bg.paste(rgba, mask=rgba.split()[3])
    return bg


def fetch_icon(category: str, icon_field: str) -> Image.Image | None:
    """SchaleDB 아이콘 다운로드 (한번)."""
    import requests

    url = f"https://schaledb.com/images/{category}/icon/{icon_field}.webp"
    try:
        res = requests.get(url, timeout=15)
        if res.status_code != 200:
            return None
        return Image.open(BytesIO(res.content))
    except Exception as e:
        log.warning(f"fetch {url}: {e}")
        return None


def embed_image(processor, model, img: Image.Image) -> np.ndarray:
    """PIL → DINOv2 CLS embedding (384,) L2 정규화."""
    import torch

    # 224×224 resize (게임 cell 도 동일 사이즈)
    img = img.convert("RGB").resize((EMBEDDING_INPUT_SIZE, EMBEDDING_INPUT_SIZE), Image.BILINEAR)
    inputs = processor(images=img, return_tensors="pt")
    with torch.no_grad():
        out = model(**inputs)
    cls = out.last_hidden_state[0, 0, :].numpy()  # (384,)
    norm = np.linalg.norm(cls) or 1.0
    return cls / norm


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--labels", nargs="+", required=True, help="라벨 JSON 파일들")
    ap.add_argument("--index", required=True, help="public/ocr 디렉토리 (items.json + embed.bin)")
    ap.add_argument("--out", required=True, help="출력 디렉토리")
    ap.add_argument("--no-icons", action="store_true", help="아이콘 fetch + embedding 건너뛰기 (cell 만)")
    args = ap.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    # 1. 인덱스 메타 + embed 로드
    index_dir = Path(args.index)
    items_json = json.loads((index_dir / "items.json").read_text())
    entries: list[dict[str, Any]] = items_json["entries"]
    key_to_meta = {e["key"]: e for e in entries}
    log.info(f"인덱스 entries: {len(entries)}")

    index_embeds = np.fromfile(index_dir / "embed.bin", dtype=np.float32).reshape(len(entries), EMBEDDING_DIM)
    np.save(out_dir / "index_embeds.npy", index_embeds)
    (out_dir / "index_meta.json").write_text(
        json.dumps({"keys": [e["key"] for e in entries], "names": [e["name"] for e in entries]}, ensure_ascii=False)
    )

    # 2. 라벨 모으기
    all_labels: list[dict[str, Any]] = []
    for path in args.labels:
        data = json.loads(Path(path).read_text())
        all_labels.extend(data["labels"])
        log.info(f"로드 {path} — {len(data['labels'])}")
    useful = [
        l for l in all_labels
        if l.get("label")
        and l["label"] not in ("none", "header", "unknown")
        and l.get("cellDataUrl")
        and l["label"] in key_to_meta
    ]
    log.info(f"학습 후보 pair: {len(useful)}")
    if not useful:
        log.error("유효 라벨 0 — 종료")
        sys.exit(1)

    # 3. DINOv2 모델 로드 + cell embedding 추출
    processor, model = load_dinov2()
    cell_embed_list: list[np.ndarray] = []
    icon_embed_list: list[np.ndarray] = []
    keys: list[str] = []
    names: list[str] = []
    skipped: list[str] = []
    icon_cache: dict[str, np.ndarray] = {}

    for i, label in enumerate(useful):
        cell_img = extract_cell_image(label["cellDataUrl"])
        if cell_img is None:
            skipped.append(label["label"])
            continue
        cell_emb = embed_image(processor, model, cell_img)

        icon_emb = None
        if not args.no_icons:
            key = label["label"]
            if key in icon_cache:
                icon_emb = icon_cache[key]
            else:
                meta = key_to_meta[key]
                icon_raw = fetch_icon(meta["category"], meta["iconField"])
                if icon_raw is None:
                    skipped.append(f"{key} (fetch fail)")
                    continue
                icon_img = composite_icon(icon_raw)
                icon_emb = embed_image(processor, model, icon_img)
                icon_cache[key] = icon_emb

        # 모두 성공한 경우만 누적 — keys / cell_embeds / icon_embeds 길이 일치 보장
        cell_embed_list.append(cell_emb)
        if icon_emb is not None:
            icon_embed_list.append(icon_emb)
        keys.append(label["label"])
        names.append(label.get("labelName", ""))
        if (i + 1) % 10 == 0 or i + 1 == len(useful):
            sys.stderr.write(f"\r  처리 {i+1}/{len(useful)}")
            sys.stderr.flush()
    sys.stderr.write("\n")

    cell_embeds = np.stack(cell_embed_list) if cell_embed_list else np.zeros((0, EMBEDDING_DIM), dtype=np.float32)
    icon_embeds = np.stack(icon_embed_list) if icon_embed_list else None

    # 4. 저장
    save_kwargs = dict(
        cell_embeds=cell_embeds,
        keys=np.array(keys, dtype=object),
        names=np.array(names, dtype=object),
    )
    if icon_embeds is not None:
        save_kwargs["icon_embeds"] = icon_embeds
    np.savez(out_dir / "pairs.npz", **save_kwargs)

    log.info(f"\n출력:")
    log.info(f"  {out_dir / 'pairs.npz'} — pairs {len(useful)}")
    log.info(f"  {out_dir / 'index_embeds.npy'} — {index_embeds.shape}")
    log.info(f"  {out_dir / 'index_meta.json'}")
    if skipped:
        log.info(f"  skipped: {len(skipped)}")
        for s in skipped[:20]:
            log.info(f"    - {s}")

    # 5. baseline 정확도 측정 (cosine top-N)
    if not args.no_icons:
        log.info("\nBaseline (현 DINOv2-small, adapter 없음) — pairs.npz vs 인덱스 1253:")
        n = len(useful)
        # cell ↔ 인덱스 전체 cosine
        sims = cell_embeds @ index_embeds.T  # (N, 1253)
        # 정답 idx
        key_to_idx = {e["key"]: i for i, e in enumerate(entries)}
        gt_idx = np.array([key_to_idx[k] for k in keys])
        ranks = np.zeros(n, dtype=int)
        for i in range(n):
            order = np.argsort(-sims[i])  # 내림차순
            ranks[i] = int(np.where(order == gt_idx[i])[0][0])
        for k in [1, 5, 10, 50]:
            hit = int(np.sum(ranks < k))
            log.info(f"  top-{k:<3}: {hit}/{n} ({hit/n*100:.1f}%)")


if __name__ == "__main__":
    main()
