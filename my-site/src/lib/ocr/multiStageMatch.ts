// Pipeline: hist 500 narrow → DINOv2 embedding cosine top-5.
// phash/hog narrow 는 도메인 갭으로 정답 86% 자름 (35 라벨 진단 결과). 폐기.
// hist 만 narrow 로 유지 (도메인 갭에 강함, 35 sample 모두 통과).
// hist/phash/hog 점수는 디버그용으로만 계산.
import { computeColorHist, histDistance, histScore, HIST_BINS } from './colorHist';
import { computePHash, hammingDistance, phashScore } from './phash';
import { computeHog, hogCosine, HOG_DIM } from './hog';
import { extractEmbeddingsTTA, embeddingCosine, applyAdapter, RAW_EMBEDDING_DIM } from './embedding';
import type { LoadedOcrIndex } from './indexLoader';

function rgbaToRgb(rgba: Uint8ClampedArray, size: number): Uint8Array {
  const rgb = new Uint8Array(size * size * 3);
  for (let i = 0; i < size * size; i++) {
    rgb[i * 3] = rgba[i * 4];
    rgb[i * 3 + 1] = rgba[i * 4 + 1];
    rgb[i * 3 + 2] = rgba[i * 4 + 2];
  }
  return rgb;
}

const HIST_NARROW = 500;
const TOP_K = 5;

export interface MatchCandidate {
  /** 인덱스 슬롯 idx → entries[idx] 메타로 매핑 */
  idx: number;
  /** 0~1 (HOG cosine similarity) */
  score: number;
  histScore: number;
  phashDist: number;
}

export async function matchAgainstIndex(
  cellRgba: Uint8ClampedArray,
  cellGray: Uint8Array,
  size: number,
  index: LoadedOcrIndex,
): Promise<MatchCandidate[]> {
  if (size !== index.meta.normSize) {
    throw new Error(`size ${size} mismatch with index ${index.meta.normSize}`);
  }
  const cellHist = computeColorHist(cellRgba, size, size);
  const cellPhash = computePHash(cellGray, size, size);
  const cellHog = computeHog(cellGray, size, size);

  const n = index.meta.entries.length;
  const stage1: { idx: number; score: number }[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const offset = i * HIST_BINS;
    const slice = index.hists.subarray(offset, offset + HIST_BINS);
    stage1[i] = { idx: i, score: histScore(histDistance(cellHist, slice)) };
  }
  stage1.sort((a, b) => b.score - a.score);
  const stage1Top = stage1.slice(0, Math.min(HIST_NARROW, n));

  // Stage 2: DINOv2 embedding cosine (500 → top-5). adapter 적용 시 384 → 128 투사.
  const cellRgb = rgbaToRgb(cellRgba, size);
  const rawCellEmbeds = await extractEmbeddingsTTA(cellRgb, size);
  const matchDim = index.meta.embeddingDim;
  const cellEmbeds: Float32Array[] = index.adapter
    ? rawCellEmbeds.map((e) =>
        applyAdapter(e, index.adapter!, RAW_EMBEDDING_DIM, matchDim),
      )
    : rawCellEmbeds;
  const V = index.meta.hogVariants ?? 1;
  const finalCands: MatchCandidate[] = stage1Top.map((c) => {
    const phashD = hammingDistance(cellPhash, index.phashes[c.idx]);
    let hogBest = -Infinity;
    for (let v = 0; v < V; v++) {
      const off = (c.idx * V + v) * HOG_DIM;
      const slotHog = index.hogs.subarray(off, off + HOG_DIM);
      const cos = hogCosine(cellHog, slotHog);
      if (cos > hogBest) hogBest = cos;
    }
    void hogBest; void phashScore;
    const off = c.idx * matchDim;
    const slotEmbed = index.embeds.subarray(off, off + matchDim);
    let best = -Infinity;
    for (const ce of cellEmbeds) {
      const cos = embeddingCosine(ce, slotEmbed);
      if (cos > best) best = cos;
    }
    return { idx: c.idx, score: best, histScore: c.score, phashDist: phashD };
  });
  finalCands.sort((a, b) => b.score - a.score);
  return finalCands.slice(0, TOP_K);
}
