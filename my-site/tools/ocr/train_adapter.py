#!/usr/bin/env python3
"""
Step C — Linear adapter 학습.

Frozen DINOv2-small (384-dim CLS) 위에 Linear(384, 128) projection.
Loss: cell ↔ icon cosine maximize + cell ↔ negative icons minimize.

사용법:
  python train_adapter.py \\
    --data ../../data/adapter \\
    --out ../../data/adapter \\
    --epochs 200 --lr 1e-3 --margin 0.2

입력 (build_adapter_dataset.py 출력):
  data/pairs.npz       — cell_embeds (N×384), icon_embeds (N×384), keys (N)
  data/index_embeds.npy — 1253×384 (negative pool)
  data/index_meta.json  — { keys: [...], names: [...] }

출력:
  out/adapter.pt        — torch state_dict
  out/adapter.onnx      — ONNX export (브라우저 통합용)
  out/adapter_meta.json — { input_dim, output_dim, trained_at, ... }
  out/eval.json         — hold-out + 전체 정확도
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np

logging.basicConfig(stream=sys.stderr, level=logging.INFO, format="[%(levelname)s] %(message)s")
log = logging.getLogger(__name__)


def l2_normalize(x):
    import torch

    return x / (torch.linalg.vector_norm(x, dim=-1, keepdim=True) + 1e-8)


class LinearAdapter:
    """torch nn.Module — Linear(in_dim, out_dim) + L2 norm. forward 만."""

    def __init__(self, in_dim: int, out_dim: int):
        import torch.nn as nn

        self.mod = nn.Sequential(nn.Linear(in_dim, out_dim, bias=False))

    def forward(self, x):
        return l2_normalize(self.mod(x))


def triplet_loss(anchor, positive, negative, margin: float):
    """Cosine triplet — anchor·negative - anchor·positive + margin > 0 이면 loss."""
    import torch

    pos_sim = (anchor * positive).sum(dim=-1)
    neg_sim = (anchor * negative).sum(dim=-1)
    loss = torch.clamp(neg_sim - pos_sim + margin, min=0.0)
    return loss.mean()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--out-dim", type=int, default=128)
    ap.add_argument("--epochs", type=int, default=200)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--margin", type=float, default=0.2)
    ap.add_argument("--batch-size", type=int, default=16)
    ap.add_argument("--negatives-per-pos", type=int, default=8, help="positive 1개당 negative 샘플 수 (in-batch + 인덱스)")
    ap.add_argument("--holdout-ratio", type=float, default=0.15)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    import torch

    torch.manual_seed(args.seed)
    np.random.seed(args.seed)

    data_dir = Path(args.data)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    # 1. 데이터 로드
    pairs = np.load(data_dir / "pairs.npz", allow_pickle=True)
    cell_e = pairs["cell_embeds"]  # (N, 384)
    icon_e = pairs["icon_embeds"]  # (N, 384)
    keys = pairs["keys"].tolist()
    n = len(keys)
    index_e = np.load(data_dir / "index_embeds.npy")  # (1253, 384)
    index_meta = json.loads((data_dir / "index_meta.json").read_text())
    in_dim = cell_e.shape[1]
    log.info(f"pairs: {n}, index pool: {index_e.shape[0]}, in_dim={in_dim} → out_dim={args.out_dim}")

    # 2. hold-out split (stratified 어렵 → random)
    perm = np.random.permutation(n)
    n_holdout = max(1, int(n * args.holdout_ratio))
    holdout_idx = perm[:n_holdout]
    train_idx = perm[n_holdout:]
    log.info(f"train: {len(train_idx)}, holdout: {len(holdout_idx)}")

    cell_train = torch.from_numpy(cell_e[train_idx]).float()
    icon_train = torch.from_numpy(icon_e[train_idx]).float()
    cell_hold = torch.from_numpy(cell_e[holdout_idx]).float()
    keys_train = [keys[i] for i in train_idx]
    keys_hold = [keys[i] for i in holdout_idx]

    index_t = torch.from_numpy(index_e).float()  # (1253, 384)
    key_to_idx = {k: i for i, k in enumerate(index_meta["keys"])}
    gt_idx_train = torch.tensor([key_to_idx[k] for k in keys_train])
    gt_idx_hold = torch.tensor([key_to_idx[k] for k in keys_hold])

    # 3. baseline (adapter 없음, raw DINOv2) 정확도 — train + holdout
    def evaluate(adapter_fn=None, cell_emb=cell_hold, gt=gt_idx_hold, label=""):
        with torch.no_grad():
            c = adapter_fn(cell_emb) if adapter_fn else cell_emb
            ix = adapter_fn(index_t) if adapter_fn else index_t
            sims = c @ ix.T  # (M, 1253)
            order = torch.argsort(-sims, dim=-1)
            results = {}
            n_eval = c.shape[0]
            for k in [1, 5, 10, 50]:
                hit = (order[:, :k] == gt.unsqueeze(1)).any(dim=1).sum().item()
                results[f"top{k}"] = (hit, n_eval, hit / n_eval * 100)
            log.info(
                f"  [{label}] top-1 {results['top1'][0]}/{n_eval} ({results['top1'][2]:.1f}%) | "
                f"top-5 {results['top5'][2]:.1f}% | top-10 {results['top10'][2]:.1f}% | top-50 {results['top50'][2]:.1f}%"
            )
            return results

    log.info("\nBaseline (raw DINOv2, no adapter):")
    base_hold = evaluate(label="hold-out")
    base_train = evaluate(cell_emb=torch.from_numpy(cell_e[train_idx]).float(), gt=gt_idx_train, label="train")

    # 4. Adapter 학습
    adapter = LinearAdapter(in_dim, args.out_dim)
    optim = torch.optim.Adam(adapter.mod.parameters(), lr=args.lr)
    n_train = len(train_idx)

    log.info(f"\n학습 시작 — {args.epochs} epochs, batch={args.batch_size}, margin={args.margin}, neg/pos={args.negatives_per_pos}")
    t0 = time.time()
    best_hold_top1 = 0
    best_state = None

    for epoch in range(args.epochs):
        # mini-batch
        ep_order = np.random.permutation(n_train)
        ep_loss = 0.0
        ep_steps = 0
        for s in range(0, n_train, args.batch_size):
            batch_idx = ep_order[s : s + args.batch_size]
            anchor = adapter.forward(cell_train[batch_idx])  # (B, out_dim)
            positive = adapter.forward(icon_train[batch_idx])  # (B, out_dim)
            # negative: 인덱스에서 in-batch GT 외 random sample × negatives_per_pos
            B = anchor.shape[0]
            negs: list[Any] = []
            for b in range(B):
                gt = key_to_idx[keys_train[batch_idx[b]]]
                neg_pool = np.random.randint(0, index_t.shape[0], size=args.negatives_per_pos * 2)
                neg_pool = neg_pool[neg_pool != gt][: args.negatives_per_pos]
                negs.append(neg_pool)
            negs_arr = np.stack(negs)  # (B, K)
            neg_emb = adapter.forward(index_t[torch.from_numpy(negs_arr).long()])  # (B, K, out_dim)

            # triplet — anchor expanded
            anchor_exp = anchor.unsqueeze(1).expand(-1, args.negatives_per_pos, -1)
            positive_exp = positive.unsqueeze(1).expand(-1, args.negatives_per_pos, -1)
            loss = triplet_loss(
                anchor_exp.reshape(-1, args.out_dim),
                positive_exp.reshape(-1, args.out_dim),
                neg_emb.reshape(-1, args.out_dim),
                args.margin,
            )
            optim.zero_grad()
            loss.backward()
            optim.step()
            ep_loss += loss.item()
            ep_steps += 1

        if (epoch + 1) % max(1, args.epochs // 20) == 0 or epoch == 0:
            avg = ep_loss / ep_steps
            with torch.no_grad():
                c = adapter.forward(cell_hold)
                ix = adapter.forward(index_t)
                sims = c @ ix.T
                order = torch.argsort(-sims, dim=-1)
                top1 = (order[:, :1] == gt_idx_hold.unsqueeze(1)).any(dim=1).sum().item()
                top1_pct = top1 / len(holdout_idx) * 100
            log.info(f"  epoch {epoch+1:4d}/{args.epochs} | loss {avg:.4f} | hold top-1 {top1}/{len(holdout_idx)} ({top1_pct:.1f}%)")
            if top1 > best_hold_top1:
                best_hold_top1 = top1
                best_state = {k: v.detach().clone() for k, v in adapter.mod.state_dict().items()}

    dt = time.time() - t0
    log.info(f"\n학습 완료 — {dt:.1f}s, best hold top-1 = {best_hold_top1}/{len(holdout_idx)}")

    # best state 로 복원
    if best_state is not None:
        adapter.mod.load_state_dict(best_state)

    # 5. 최종 평가
    log.info("\nAdapter 적용:")
    eval_hold = evaluate(adapter_fn=adapter.forward, label="hold-out")
    eval_train = evaluate(adapter_fn=adapter.forward, cell_emb=cell_train, gt=gt_idx_train, label="train")
    eval_all = evaluate(
        adapter_fn=adapter.forward,
        cell_emb=torch.from_numpy(cell_e).float(),
        gt=torch.tensor([key_to_idx[k] for k in keys]),
        label="all",
    )

    # 6. 저장
    torch.save(adapter.mod.state_dict(), out_dir / "adapter.pt")
    log.info(f"\n  {out_dir / 'adapter.pt'}")

    # ONNX export — input (B, 384) → output (B, out_dim) L2 정규화 포함
    class ExportWrapper(torch.nn.Module):
        def __init__(self, linear):
            super().__init__()
            self.linear = linear

        def forward(self, x):
            y = self.linear(x)
            return y / (torch.linalg.vector_norm(y, dim=-1, keepdim=True) + 1e-8)

    wrapper = ExportWrapper(adapter.mod[0]).eval()
    dummy = torch.randn(1, in_dim)
    onnx_path = out_dir / "adapter.onnx"
    # torch 2.12 의 dynamo exporter 는 onnxscript 의존 — 옛 (TorchScript) 사용.
    torch.onnx.export(
        wrapper,
        dummy,
        str(onnx_path),
        input_names=["embedding"],
        output_names=["projection"],
        dynamic_axes={"embedding": {0: "batch"}, "projection": {0: "batch"}},
        opset_version=17,
        dynamo=False,
    )
    log.info(f"  {onnx_path}")

    # meta
    meta = {
        "input_dim": in_dim,
        "output_dim": args.out_dim,
        "trained_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "n_pairs": n,
        "n_train": int(len(train_idx)),
        "n_holdout": int(len(holdout_idx)),
        "epochs": args.epochs,
        "lr": args.lr,
        "margin": args.margin,
        "batch_size": args.batch_size,
        "negatives_per_pos": args.negatives_per_pos,
        "baseline": {"hold": base_hold, "train": base_train},
        "adapter": {"hold": eval_hold, "train": eval_train, "all": eval_all},
        "best_hold_top1": best_hold_top1,
    }
    (out_dir / "adapter_meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False))
    log.info(f"  {out_dir / 'adapter_meta.json'}")

    # 7. 인덱스 embed 도 adapter 적용해서 저장 (브라우저용)
    with torch.no_grad():
        adapted_index = adapter.forward(index_t).numpy().astype(np.float32)
    (out_dir / "index_adapted_embeds.bin").write_bytes(adapted_index.tobytes())
    log.info(f"  {out_dir / 'index_adapted_embeds.bin'} — {adapted_index.shape}")

    print(f"\n=== 요약 ===")
    print(f"Baseline hold top-1 : {base_hold['top1'][2]:.1f}%")
    print(f"Adapter  hold top-1 : {eval_hold['top1'][2]:.1f}%  ({'↑' if eval_hold['top1'][0] > base_hold['top1'][0] else '↓ or ='})")
    print(f"Adapter  train top-1: {eval_train['top1'][2]:.1f}% (참고 — overfit 지표)")


if __name__ == "__main__":
    main()
