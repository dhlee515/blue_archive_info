// HSV 색 히스토그램 (H 16 × S 4 × V 4 = 256 bins). PLAN_ocr_browser_matching.md §3.3.2 의
// 1차 필터용. 빌드 / 매칭 양쪽에서 같은 알고리즘이어야 인덱스 호환.

const H_BINS = 16;
const S_BINS = 4;
const V_BINS = 4;
export const HIST_BINS = H_BINS * S_BINS * V_BINS;

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return [h, s, v];
}

/**
 * RGBA 픽셀 버퍼 → L1 정규화 HSV 히스토그램.
 * alpha < 128 픽셀은 건너뜀 (투명 배경 제외).
 */
export function computeColorHist(
  rgba: Uint8Array | Uint8ClampedArray,
  w: number,
  h: number,
): Float32Array {
  const hist = new Float32Array(HIST_BINS);
  let total = 0;
  for (let i = 0; i < w * h; i++) {
    const p = i * 4;
    if (rgba[p + 3] < 128) continue;
    const [hv, sv, vv] = rgbToHsv(rgba[p], rgba[p + 1], rgba[p + 2]);
    const hi = Math.min(H_BINS - 1, Math.floor((hv / 360) * H_BINS));
    const si = Math.min(S_BINS - 1, Math.floor(sv * S_BINS));
    const vi = Math.min(V_BINS - 1, Math.floor(vv * V_BINS));
    hist[hi * S_BINS * V_BINS + si * V_BINS + vi]++;
    total++;
  }
  if (total > 0) for (let i = 0; i < HIST_BINS; i++) hist[i] /= total;
  return hist;
}

/** L1 거리. 두 정규화 히스토그램이면 0~2 범위. */
export function histDistance(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum;
}

/** L1 거리 → 유사도 0~1 (0.5 거리부터 점수 0). */
export function histScore(distance: number): number {
  return Math.max(0, 1 - distance / 2);
}
