// HOG (Histogram of Oriented Gradients) descriptor — 순수 TS, OpenCV 의존성 없음.
//
// 의견 2 의 (3) embedding 방향: 픽셀 단위 NCC 가 정답과 오답을 분리 못 하는 문제
// (margin ≈ 0.010) 를 해결하기 위함. HOG 는 픽셀 값 대신 gradient 방향 분포를
// 표현해 광택/색감 차이에 강하고 형태가 비슷한 정답에 큰 cosine 점수를 부여한다.
//
// 96×96 입력 기준 파라미터 (fine-grained — sweet spot):
//   cell size  = 12  → 8×8 = 64 cells
//   bins       = 9   (unsigned orientation, 0~π)
//   block      = 2×2 cells, stride 1 cell → 7×7 = 49 blocks
//   block dim  = 4 × 9 = 36
//   total dim  = 49 × 36 = 1764
//
// cell 8 (dim 4356) 는 너무 fine 해서 모든 cosine 평탄화 (margin ↓). cell 16 (dim 900) 은 너무 coarse.

export const HOG_CELL = 12;
export const HOG_BINS = 9;
export const HOG_BLOCK_CELLS = 2;
export const HOG_DIM = 1764;

/**
 * 96×96 그레이스케일 이미지를 받아 HOG 벡터 (900-dim, L2 정규화) 반환.
 */
export function computeHog(gray: Uint8Array, w: number, h: number): Float32Array {
  // 1) Sobel — gradient magnitude + unsigned angle ([0, π))
  const n = w * h;
  const mag = new Float32Array(n);
  const ang = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    const y0 = y > 0 ? y - 1 : 0;
    const y1 = y < h - 1 ? y + 1 : h - 1;
    for (let x = 0; x < w; x++) {
      const x0 = x > 0 ? x - 1 : 0;
      const x1 = x < w - 1 ? x + 1 : w - 1;
      const p00 = gray[y0 * w + x0];
      const p01 = gray[y0 * w + x];
      const p02 = gray[y0 * w + x1];
      const p10 = gray[y * w + x0];
      const p12 = gray[y * w + x1];
      const p20 = gray[y1 * w + x0];
      const p21 = gray[y1 * w + x];
      const p22 = gray[y1 * w + x1];
      const gx = -p00 - 2 * p10 - p20 + p02 + 2 * p12 + p22;
      const gy = -p00 - 2 * p01 - p02 + p20 + 2 * p21 + p22;
      mag[y * w + x] = Math.sqrt(gx * gx + gy * gy);
      let a = Math.atan2(gy, gx);
      if (a < 0) a += Math.PI;
      if (a >= Math.PI) a -= Math.PI;
      ang[y * w + x] = a;
    }
  }

  // 2) Cell histograms — bilinear bin interpolation
  const cellsX = Math.floor(w / HOG_CELL);
  const cellsY = Math.floor(h / HOG_CELL);
  const cellHist = new Float32Array(cellsX * cellsY * HOG_BINS);
  const binWidth = Math.PI / HOG_BINS;
  for (let y = 0; y < cellsY * HOG_CELL; y++) {
    const cy = Math.floor(y / HOG_CELL);
    for (let x = 0; x < cellsX * HOG_CELL; x++) {
      const cx = Math.floor(x / HOG_CELL);
      const idx = y * w + x;
      const m = mag[idx];
      if (m < 1) continue;
      const a = ang[idx];
      const t = a / binWidth - 0.5;
      const lo = Math.floor(t);
      const frac = t - lo;
      const b0 = ((lo % HOG_BINS) + HOG_BINS) % HOG_BINS;
      const b1 = (b0 + 1) % HOG_BINS;
      const base = (cy * cellsX + cx) * HOG_BINS;
      cellHist[base + b0] += m * (1 - frac);
      cellHist[base + b1] += m * frac;
    }
  }

  // 3) Blocks (2×2 cells, stride 1) + L2-Hys normalization
  const blocksX = cellsX - HOG_BLOCK_CELLS + 1;
  const blocksY = cellsY - HOG_BLOCK_CELLS + 1;
  const blockDim = HOG_BLOCK_CELLS * HOG_BLOCK_CELLS * HOG_BINS;
  const out = new Float32Array(blocksX * blocksY * blockDim);
  const eps = 1e-6;
  const clip = 0.2;
  let outIdx = 0;
  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      const start = outIdx;
      for (let dy = 0; dy < HOG_BLOCK_CELLS; dy++) {
        for (let dx = 0; dx < HOG_BLOCK_CELLS; dx++) {
          const cellBase = ((by + dy) * cellsX + (bx + dx)) * HOG_BINS;
          for (let b = 0; b < HOG_BINS; b++) {
            out[outIdx++] = cellHist[cellBase + b];
          }
        }
      }
      let sum = 0;
      for (let i = start; i < outIdx; i++) sum += out[i] * out[i];
      const norm = Math.sqrt(sum + eps);
      for (let i = start; i < outIdx; i++) {
        let v = out[i] / norm;
        if (v > clip) v = clip;
        out[i] = v;
      }
      let sum2 = 0;
      for (let i = start; i < outIdx; i++) sum2 += out[i] * out[i];
      const norm2 = Math.sqrt(sum2 + eps);
      for (let i = start; i < outIdx; i++) out[i] /= norm2;
    }
  }

  // 4) Global L2 normalize (cosine = dot product)
  let total = 0;
  for (let i = 0; i < out.length; i++) total += out[i] * out[i];
  const gn = Math.sqrt(total) || 1;
  for (let i = 0; i < out.length; i++) out[i] /= gn;

  return out;
}

/** 두 정규화된 HOG 벡터의 cosine similarity = dot product. */
export function hogCosine(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  const n = a.length;
  for (let i = 0; i < n; i++) sum += a[i] * b[i];
  return sum;
}
