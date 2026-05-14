#!/usr/bin/env python3
"""
SchaleDB 의 모든 아이템/장비/가구 아이콘을 다운로드해 perceptual hash (pHash) 인덱스를 생성.

사용법:
    python build_icon_index.py

출력:
    icon_hashes.json — { "items": [{ "key": str, "name": str, "phash": str, "category": str }, ...] }

이 인덱스는 OCR 매칭 단계에서 시각 유사도 fallback 으로 사용됩니다.
스킨/이름 변경 시 가끔 재실행해서 인덱스 갱신 권장.
"""

from __future__ import annotations

import json
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO
from pathlib import Path
from typing import Any

import imagehash
import requests
from PIL import Image

SCHALEDB_BASE = "https://schaledb.com"
OUTPUT_PATH = Path(__file__).parent / "icon_hashes.json"

# 다운로드 동시 실행 수
WORKERS = 16


def fetch_dataset(name: str) -> dict[str, Any]:
    """SchaleDB 데이터셋 (items / equipment / furniture) 다운로드."""
    url = f"{SCHALEDB_BASE}/data/kr/{name}.min.json"
    print(f"  fetching {url}", file=sys.stderr)
    res = requests.get(url, timeout=30)
    res.raise_for_status()
    return res.json()


def icon_url_for(category: str, icon_field: str) -> str:
    """SchaleDB 의 아이콘 URL 패턴."""
    if category == "item":
        return f"{SCHALEDB_BASE}/images/item/icon/{icon_field}.webp"
    if category == "equipment":
        return f"{SCHALEDB_BASE}/images/equipment/icon/{icon_field}.webp"
    if category == "furniture":
        return f"{SCHALEDB_BASE}/images/furniture/icon/{icon_field}.webp"
    raise ValueError(f"unknown category: {category}")


def compute_phash_from_url(url: str) -> str | None:
    """URL 에서 이미지를 다운로드 → pHash 계산."""
    try:
        res = requests.get(url, timeout=30)
        if res.status_code != 200:
            return None
        img = Image.open(BytesIO(res.content)).convert("RGB")
        return str(imagehash.phash(img, hash_size=8))  # 64-bit hash
    except Exception as e:
        print(f"    [skip] {url}: {e}", file=sys.stderr)
        return None


def collect_targets() -> list[dict[str, Any]]:
    """인덱싱할 (category, key, name, icon_field) 목록 빌드."""
    targets: list[dict[str, Any]] = []

    # items: Icon 필드는 보통 "item_icon_<id>" 형태이지만, schaledb 는 단순히 id 를 쓰기도 함
    items = fetch_dataset("items")
    for k, v in items.items():
        icon = v.get("Icon") or k
        targets.append(
            {
                "category": "item",
                "key": f"item:{k}",
                "name": v.get("Name", "").replace("\n", " "),
                "icon": str(icon),
            }
        )

    # equipment: Icon 필드 사용
    equipment = fetch_dataset("equipment")
    for k, v in equipment.items():
        icon = v.get("Icon") or k
        targets.append(
            {
                "category": "equipment",
                "key": f"equipment:{k}",
                "name": v.get("Name", "").replace("\n", " "),
                "icon": str(icon),
            }
        )

    # furniture 는 의도적으로 제외 — 인벤토리 페이지에 추적되지 않고 시각 매칭 노이즈만 됨

    return targets


def main() -> None:
    print("== SchaleDB 아이콘 인덱스 빌더 ==", file=sys.stderr)
    targets = collect_targets()
    print(f"총 {len(targets)}개 아이콘 처리 시작...", file=sys.stderr)

    results: list[dict[str, Any]] = []

    def task(t: dict[str, Any]) -> dict[str, Any] | None:
        url = icon_url_for(t["category"], t["icon"])
        ph = compute_phash_from_url(url)
        if ph is None:
            return None
        return {"key": t["key"], "name": t["name"], "category": t["category"], "phash": ph}

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = [pool.submit(task, t) for t in targets]
        done = 0
        for fut in as_completed(futures):
            r = fut.result()
            if r is not None:
                results.append(r)
            done += 1
            if done % 50 == 0:
                print(f"  진행: {done}/{len(targets)}", file=sys.stderr)

    print(
        f"성공: {len(results)} / 시도: {len(targets)} (실패는 아이콘 미존재 또는 404)",
        file=sys.stderr,
    )

    payload = {"version": 1, "source": "schaledb.com/kr", "items": results}
    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    size_kb = OUTPUT_PATH.stat().st_size / 1024
    print(f"저장 완료: {OUTPUT_PATH} ({size_kb:.1f}KB)", file=sys.stderr)


if __name__ == "__main__":
    main()
