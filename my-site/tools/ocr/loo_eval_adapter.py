#!/usr/bin/env python3
"""
Step C — Leave-One-Out cross validation.

55 pair → 55번 학습 (각 1개 hold-out). hold-out 정답률 평균이
정직한 일반화 추정. small-N 표본 noise 흡수.

사용법:
  python loo_eval_adapter.py --data ../../data/adapter --epochs 200 --lr 1e-3
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--out-dim", type=int, default=128)
    ap.add_argument("--epochs", type=int, default=200)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--margin", type=float, default=0.2)
    ap.add_argument("--batch-size", type=int, default=16)
    ap.add_argument("--negatives-per-pos", type=int, default=16)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    import torch
    import torch.nn as nn

    torch.manual_seed(args.seed)
    np.random.seed(args.seed)

    data_dir = Path(args.data)
    pairs = np.load(data_dir / "pairs.npz", allow_pickle=True)
    cell_e = pairs["cell_embeds"]  # (N, 384)
    icon_e = pairs["icon_embeds"]
    keys = pairs["keys"].tolist()
    names = pairs["names"].tolist()
    n = len(keys)
    index_e = np.load(data_dir / "index_embeds.npy")  # (1253, 384)
    index_meta = json.loads((data_dir / "index_meta.json").read_text())
    key_to_idx = {k: i for i, k in enumerate(index_meta["keys"])}
    in_dim = cell_e.shape[1]

    log.info(f"LOO: N={n}, index pool={index_e.shape[0]}, in_dim={in_dim} → out_dim={args.out_dim}")
    log.info(f"epochs={args.epochs}, lr={args.lr}, margin={args.margin}")

    # Baseline LOO (adapter 없음) — fold 별 동일 결과이지만 한번 측정
    baseline_correct = {1: 0, 5: 0, 10: 0, 50: 0}
    for i in range(n):
        sims = cell_e[i] @ index_e.T  # (1253,)
        order = np.argsort(-sims)
        gt = key_to_idx[keys[i]]
        rank = int(np.where(order == gt)[0][0])
        for k in [1, 5, 10, 50]:
            if rank < k:
                baseline_correct[k] += 1
    log.info(f"\nBaseline (raw DINOv2, no adapter, no training):")
    for k in [1, 5, 10, 50]:
        log.info(f"  top-{k:<3}: {baseline_correct[k]}/{n} ({baseline_correct[k]/n*100:.1f}%)")

    # LOO 본 평가
    cell_t = torch.from_numpy(cell_e).float()
    icon_t = torch.from_numpy(icon_e).float()
    index_t = torch.from_numpy(index_e).float()

    adapter_correct = {1: 0, 5: 0, 10: 0, 50: 0}
    per_fold_rank: list[dict[str, Any]] = []

    t0 = time.time()
    for fold in range(n):
        # train = all except fold, test = fold
        tr_idx = [j for j in range(n) if j != fold]
        tr_keys = [keys[j] for j in tr_idx]

        # mini adapter
        model = nn.Linear(in_dim, args.out_dim, bias=False)
        torch.nn.init.xavier_uniform_(model.weight)
        optim = torch.optim.Adam(model.parameters(), lr=args.lr)

        for ep in range(args.epochs):
            order = np.random.permutation(len(tr_idx))
            for s in range(0, len(tr_idx), args.batch_size):
                bidx = [tr_idx[k] for k in order[s : s + args.batch_size]]
                anchor = l2_normalize(model(cell_t[bidx]))
                positive = l2_normalize(model(icon_t[bidx]))
                B = anchor.shape[0]
                # 인덱스에서 negative — GT 제외 random
                neg_indices: list[Any] = []
                for b in range(B):
                    gt = key_to_idx[keys[bidx[b]]]
                    pool = np.random.randint(0, index_t.shape[0], size=args.negatives_per_pos * 2)
                    pool = pool[pool != gt][: args.negatives_per_pos]
                    neg_indices.append(pool)
                negs = np.stack(neg_indices)
                neg_emb = l2_normalize(model(index_t[torch.from_numpy(negs).long()]))
                ae = anchor.unsqueeze(1).expand(-1, args.negatives_per_pos, -1).reshape(-1, args.out_dim)
                pe = positive.unsqueeze(1).expand(-1, args.negatives_per_pos, -1).reshape(-1, args.out_dim)
                ne = neg_emb.reshape(-1, args.out_dim)
                pos_sim = (ae * pe).sum(dim=-1)
                neg_sim = (ae * ne).sum(dim=-1)
                loss = torch.clamp(neg_sim - pos_sim + args.margin, min=0.0).mean()
                optim.zero_grad()
                loss.backward()
                optim.step()

        # fold test
        with torch.no_grad():
            test_anchor = l2_normalize(model(cell_t[fold : fold + 1]))[0]
            adapted_idx = l2_normalize(model(index_t))
            sims = (adapted_idx @ test_anchor).numpy()
        order = np.argsort(-sims)
        gt = key_to_idx[keys[fold]]
        rank = int(np.where(order == gt)[0][0])
        for k in [1, 5, 10, 50]:
            if rank < k:
                adapter_correct[k] += 1
        top1_name = index_meta["names"][order[0]]
        per_fold_rank.append(
            {
                "label": keys[fold],
                "name": names[fold],
                "rank": rank + 1,
                "top1_predict": top1_name,
                "correct": rank == 0,
            }
        )
        if (fold + 1) % 5 == 0 or fold + 1 == n:
            elapsed = time.time() - t0
            sys.stderr.write(
                f"\r  fold {fold+1:3d}/{n} | running top-1 {adapter_correct[1]}/{fold+1} ({adapter_correct[1]/(fold+1)*100:.1f}%) | elapsed {elapsed:.0f}s"
            )
            sys.stderr.flush()
    sys.stderr.write("\n")

    log.info(f"\nLOO 결과 (총 {time.time()-t0:.0f}s):")
    log.info(f"{'metric':<10} {'baseline':<15} {'adapter (LOO)':<15} {'Δ':<10}")
    for k in [1, 5, 10, 50]:
        bp = baseline_correct[k] / n * 100
        ap_ = adapter_correct[k] / n * 100
        delta = ap_ - bp
        log.info(
            f"top-{k:<5}    {baseline_correct[k]:>2}/{n} ({bp:5.1f}%)    {adapter_correct[k]:>2}/{n} ({ap_:5.1f}%)    {delta:+.1f}p"
        )

    # 오답 분석
    print("\n=== 오답 (LOO adapter) ===")
    for r in per_fold_rank:
        if not r["correct"] and r["rank"] <= 50:
            print(f"  [rank {r['rank']:3d}] {r['name']}  →  {r['top1_predict']}")
        elif not r["correct"]:
            print(f"  [rank {r['rank']:4d}] {r['name']}  →  {r['top1_predict']}  (top-50 밖)")


if __name__ == "__main__":
    main()
