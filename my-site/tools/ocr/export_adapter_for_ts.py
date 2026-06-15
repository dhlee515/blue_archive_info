#!/usr/bin/env python3
"""
Adapter weights (384×128) → public/ocr/adapter.bin (float32, row-major)
인덱스 embed.bin → 1254 × 128 adapted embedding 으로 교체.

사용법:
  python export_adapter_for_ts.py --data ../../data/adapter --index ../../public/ocr
"""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

import numpy as np


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True, help="adapter.pt + index_adapted_embeds.bin 디렉토리")
    ap.add_argument("--index", required=True, help="public/ocr 디렉토리")
    args = ap.parse_args()

    import torch

    data_dir = Path(args.data)
    index_dir = Path(args.index)

    # 1. adapter weights → adapter.bin
    state = torch.load(data_dir / "adapter.pt", map_location="cpu", weights_only=True)
    # Linear(384, 128, bias=False) — weight shape (128, 384) (out, in)
    # TS 측에서 cell_emb(384,) · W^T 형태로 곱하려면 (384, 128) 형태 (in, out) 가 편함
    W = state["0.weight"].numpy()  # (128, 384)
    print(f"adapter weight shape: {W.shape}")
    W_T = W.T.astype(np.float32)  # (384, 128) row-major: in 차원 slow, out 차원 fast
    print(f"transposed (in, out): {W_T.shape}, dtype={W_T.dtype}")
    out_adapter = index_dir / "adapter.bin"
    out_adapter.write_bytes(W_T.tobytes())
    print(f"  → {out_adapter} ({out_adapter.stat().st_size / 1024:.1f} KB)")

    # 2. 인덱스 embed.bin 백업 + 교체 (128-dim adapted)
    src_idx = data_dir / "index_adapted_embeds.bin"
    if not src_idx.exists():
        raise FileNotFoundError(f"{src_idx} 없음 — train_adapter.py 가 만들어야 함")
    src_bytes = src_idx.read_bytes()
    # 1254 × 128 × 4 = 642048 bytes 예상
    expected_n_per_dim = len(src_bytes) // 4
    print(f"adapted index embed: {expected_n_per_dim / 128} entries × 128-dim ({len(src_bytes)} bytes)")

    embed_bin = index_dir / "embed.bin"
    if embed_bin.exists():
        backup = index_dir / "embed.384.bak.bin"
        if not backup.exists():
            shutil.copy(embed_bin, backup)
            print(f"  백업: {backup}")
    embed_bin.write_bytes(src_bytes)
    print(f"  → {embed_bin} 교체 ({embed_bin.stat().st_size / 1024:.1f} KB)")

    # 3. items.json 의 embeddingDim 업데이트
    items_path = index_dir / "items.json"
    items = json.loads(items_path.read_text())
    old_dim = items.get("embeddingDim", 384)
    items["embeddingDim"] = 128
    items["adapter"] = {
        "enabled": True,
        "inputDim": 384,
        "outputDim": 128,
        "weightPath": "adapter.bin",
    }
    items_path.write_text(json.dumps(items, ensure_ascii=False))
    print(f"  items.json: embeddingDim {old_dim} → 128, adapter 메타 추가")

    # 4. adapter.json (TS 측 로딩 메타)
    adapter_meta_src = data_dir / "adapter_meta.json"
    if adapter_meta_src.exists():
        shutil.copy(adapter_meta_src, index_dir / "adapter_meta.json")
        print(f"  adapter_meta.json 복사")


if __name__ == "__main__":
    main()
