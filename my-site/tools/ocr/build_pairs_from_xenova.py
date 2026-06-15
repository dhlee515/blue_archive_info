#!/usr/bin/env python3
"""
Xenova/dinov2-small 기반 cell embedding (TS 추출) + 인덱스 Xenova embed
(embed.384.bak.bin) 로 adapter 학습용 pairs.npz 재구성.

이전 pairs.npz (Python facebook 기반) 와 같은 형식이지만 Xenova 분포에서.

사용법:
  python build_pairs_from_xenova.py \\
    --cell-embeds ../../data/adapter/cell_embeds_ts.bin \\
    --cell-meta   ../../data/adapter/cell_embeds_ts.meta.json \\
    --index-embeds ../../public/ocr/embed.384.bak.bin \\
    --index-meta  ../../public/ocr/items.json \\
    --out ../../data/adapter
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cell-embeds", required=True)
    ap.add_argument("--cell-meta", required=True)
    ap.add_argument("--index-embeds", required=True)
    ap.add_argument("--index-meta", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--dim", type=int, default=384)
    args = ap.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    # 1. cell embeds
    cell_meta = json.loads(Path(args.cell_meta).read_text())
    N = cell_meta["n"]
    dim = cell_meta["dim"]
    assert dim == args.dim, f"dim mismatch {dim} != {args.dim}"
    cell_e = np.frombuffer(Path(args.cell_embeds).read_bytes(), dtype=np.float32).reshape(N, dim)
    keys = cell_meta["keys"]
    names = cell_meta["names"]
    print(f"cell embed: {cell_e.shape} (Xenova/dinov2-small)")

    # 2. index embeds (raw 384, Xenova)
    index_meta = json.loads(Path(args.index_meta).read_text())
    entries = index_meta["entries"]
    M = len(entries)
    raw = np.frombuffer(Path(args.index_embeds).read_bytes(), dtype=np.float32)
    if raw.size != M * dim:
        raise ValueError(f"index embed size {raw.size} != {M * dim}")
    index_e = raw.reshape(M, dim)
    print(f"index embed: {index_e.shape}")

    # 3. icon embeds — keys 각각의 GT 슬롯에서 추출
    key_to_idx = {e["key"]: i for i, e in enumerate(entries)}
    icon_e = np.zeros((N, dim), dtype=np.float32)
    missing = []
    for i, k in enumerate(keys):
        if k not in key_to_idx:
            missing.append(k)
            continue
        icon_e[i] = index_e[key_to_idx[k]]
    if missing:
        print(f"missing keys: {len(missing)}")

    # 4. 저장 — train_adapter 가 읽는 형식
    np.savez(
        out_dir / "pairs.npz",
        cell_embeds=cell_e,
        icon_embeds=icon_e,
        keys=np.array(keys, dtype=object),
        names=np.array(names, dtype=object),
    )
    np.save(out_dir / "index_embeds.npy", index_e)
    Path(out_dir / "index_meta.json").write_text(
        json.dumps({"keys": [e["key"] for e in entries], "names": [e["name"] for e in entries]}, ensure_ascii=False)
    )
    print(f"\n저장:")
    print(f"  {out_dir / 'pairs.npz'} — pairs {N}")
    print(f"  {out_dir / 'index_embeds.npy'} — {index_e.shape}")
    print(f"  {out_dir / 'index_meta.json'}")

    # 5. baseline 측정
    sims = cell_e @ index_e.T  # (N, M)
    gt_idx = np.array([key_to_idx[k] for k in keys if k in key_to_idx])
    ranks = np.zeros(N, dtype=int)
    for i in range(N):
        order = np.argsort(-sims[i])
        ranks[i] = int(np.where(order == gt_idx[i])[0][0])
    print(f"\nBaseline (Xenova, no adapter) — N={N}:")
    for k in [1, 5, 10, 50]:
        hit = int(np.sum(ranks < k))
        print(f"  top-{k:<3}: {hit}/{N} ({hit/N*100:.1f}%)")


if __name__ == "__main__":
    main()
