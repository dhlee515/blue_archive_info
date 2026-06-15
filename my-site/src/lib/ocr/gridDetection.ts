// 자기상관(autocorrelation) 기반 그리드 주기 검출. PLAN_ocr_browser_matching.md §3.4.
//
// 입력: RGBA 픽셀 + 해상도. 출력: 셀 bbox 리스트 + 디버그 값.
// pure TS (DOM 의존 없음) → Node 빌드/검증 + 브라우저 양쪽에서 동일 결과.
//
// 원리:
//   1. HSV S(채도) 프로파일을 가로/세로 1D 로 압축
//   2. 1D autocorrelation → 가장 강한 peak = 셀 주기 (P_x, P_y)
//   3. 동일 주기로 offset 검색 → 격자 시작점
//   4. 격자점들로 셀 후보 생성
//   5. 셀 후보의 색 통계로 false positive 컷
//
// 모바일/PC 무관: 셀들이 일정 간격이라는 보편 특성만 의존.

export interface CellBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GridDetectResult {
  cells: CellBox[];
  periodX: number;
  periodY: number;
  offsetX: number;
  offsetY: number;
}

/** ROI(관심 영역) 옵션 — 그리드가 화면 일부에만 있는 경우 사용. 0~1 정규화 비율 */
export interface DetectGridOptions {
  /** [x_start, x_end] 가로 비율. 기본 [0, 1] (전체). 모바일 인벤토리는 [0.5, 1] 권장 */
  roiX?: [number, number];
  /** [y_start, y_end] 세로 비율. 기본 [0, 1] */
  roiY?: [number, number];
}

/** 1600px 다운샘플 기준 최소 셀 변 — 실제 인벤토리 셀은 보통 120+ 라 100 으로 sub-period 컷 */
const MIN_CELL_SIDE = 100;
const MAX_CELL_SIDE_FRAC = 0.4;
const VALIDATE_MIN_MEAN_S = 0.06;
const VALIDATE_STRIDE = 2;
/** autocorrelation peak 후보 상위 N개를 시도 후 cellHasContent 통과율이 가장 높은 주기를 선택 */
const PERIOD_CANDIDATES = 6;
/** 셀 종횡비 ratio = w/h. 게임 인벤토리는 보통 정사각형 ± 30% */
const MIN_ASPECT = 0.7;
const MAX_ASPECT = 1.4;
/** harmonic 검증: P 가 진짜 주기면 2P 위치에서도 ac peak (또는 strong 값) 가 있어야 함 */
const HARMONIC_CHECK_MIN_RATIO = 0.5; // ac[2P] / ac[P] 이 이 비율 이상이어야 진짜 P

function rgbToS(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

/** 각 column / row 의 평균 S(채도). 셀 안에는 색감이 강하고 갭은 흰/검 → S 가 약함. */
export function computeSaturationProjections(
  rgba: Uint8Array | Uint8ClampedArray,
  w: number,
  h: number,
): { sx: Float32Array; sy: Float32Array } {
  const sx = new Float32Array(w);
  const sy = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      const s = rgbToS(rgba[p], rgba[p + 1], rgba[p + 2]);
      sx[x] += s;
      sy[y] += s;
    }
  }
  for (let x = 0; x < w; x++) sx[x] /= h;
  for (let y = 0; y < h; y++) sy[y] /= w;
  return { sx, sy };
}

/**
 * 정규화 자기상관 (lag 0~maxLag).
 * 시그널 길이 N, 시간 복잡도 O(N × maxLag). N=1600, maxLag=480 → ~770K 곱 — 수십 ms.
 */
export function autocorrelate(signal: Float32Array, maxLag: number): Float32Array {
  const N = signal.length;
  let mean = 0;
  for (let i = 0; i < N; i++) mean += signal[i];
  mean /= N;
  let var0 = 0;
  for (let i = 0; i < N; i++) {
    const d = signal[i] - mean;
    var0 += d * d;
  }
  const lim = Math.min(maxLag, N - 1);
  const result = new Float32Array(lim + 1);
  if (var0 < 1e-9) return result;
  for (let lag = 0; lag <= lim; lag++) {
    let sum = 0;
    for (let i = 0; i < N - lag; i++) {
      sum += (signal[i] - mean) * (signal[i + lag] - mean);
    }
    result[lag] = sum / var0;
  }
  return result;
}

/** minLag~maxLag 범위의 local-maxima peak 들을 강한 순으로 정렬 + harmonic(2배) lag 제거 후 top N 반환.
 * 가장 작은 진짜 주기를 유지하고 2P, 3P 같은 harmonic peak 는 candidate 에서 제외. */
function findCandidatePeriods(
  ac: Float32Array,
  minLag: number,
  maxLag: number,
  topN: number,
): number[] {
  const lim = Math.min(maxLag, ac.length - 2);
  const peaks: { lag: number; score: number }[] = [];
  for (let lag = Math.max(minLag, 1); lag <= lim; lag++) {
    if (ac[lag] > ac[lag - 1] && ac[lag] > ac[lag + 1]) {
      const twoLag = lag * 2;
      const harmonic = twoLag < ac.length ? Math.min(1, ac[twoLag] / Math.max(1e-6, ac[lag])) : 0;
      peaks.push({ lag, score: ac[lag] * (1 + harmonic) });
    }
  }
  peaks.sort((a, b) => b.score - a.score);

  // harmonic dedup (양방향): 후보 lag 가 이미 kept 의 정수배이거나 약수 (정수비) 면 제거.
  // 점수 순 정렬 후 채택하므로 진짜 주기 (가장 강한 peak) 가 먼저 kept 에 들어감 → 나중 sub-period 또는 super-period 제거.
  const kept: { lag: number; score: number }[] = [];
  for (const p of peaks) {
    const isRelatedToKept = kept.some((k) => {
      const big = Math.max(p.lag, k.lag);
      const small = Math.min(p.lag, k.lag);
      const ratio = big / small;
      return ratio > 1.5 && Math.abs(ratio - Math.round(ratio)) < 0.1;
    });
    if (!isRelatedToKept) kept.push(p);
    if (kept.length >= topN) break;
  }
  // 큰 lag (= maxSide 의 절반 이상) 가 선택된 케이스 보정: ROI 안 반복 횟수 적어 진짜 P 의
  // 자기상관이 약하고 2P 만 강하게 잡힐 수 있음 (mobile-54, pc-16:9-42). 그런 lag 만 half 추가.
  const lags = kept.map((p) => p.lag);
  const halfThreshold = maxLag * 0.5;
  for (const lag of [...lags]) {
    if (lag < halfThreshold) continue;
    const half = Math.round(lag / 2);
    if (half >= minLag && !lags.includes(half)) lags.push(half);
  }
  return lags;
}

/** 주기 P 로 신호를 sampling 했을 때 sample 값들의 평균 S 가 최대가 되는 offset.
 * sample 들이 셀 내부 (대체로 셀 중앙 가까이) 에 떨어질 때 max → 결과는 셀 중앙 위치.
 * 셀 시작점은 호출부에서 P/2 빼서 계산한다 (cellStartFromCenter). */
function estimateOffset(signal: Float32Array, period: number): number {
  const N = signal.length;
  let bestOffset = 0;
  let bestMean = -Infinity;
  for (let off = 0; off < period; off++) {
    let sum = 0;
    let count = 0;
    for (let pos = off; pos < N; pos += period) {
      sum += signal[pos];
      count++;
    }
    const mean = count > 0 ? sum / count : -Infinity;
    if (mean > bestMean) {
      bestMean = mean;
      bestOffset = off;
    }
  }
  return bestOffset;
}

/** estimateOffset 결과(셀 중앙 위치) → 셀 시작점 (gutter 직후) 으로 변환. mod period. */
function cellStartFromCenter(center: number, period: number): number {
  const shifted = center - Math.floor(period / 2);
  return ((shifted % period) + period) % period;
}

/** 셀 영역의 평균 S 가 임계값 이상 + 셀 내부 S > 셀 경계 S 면 진짜 셀.
 * alignment 검증은 false positive (헤더/푸터에 잘못 잡힌 셀) 컷.
 * 진짜 셀: 내부에 아이콘(고채도) + 경계가 gutter(저채도) → inner > outer
 * 가짜 셀 (텍스트 영역 등): 내부/경계 채도 비슷하거나 역전 → inner ≤ outer */
function cellHasContent(
  rgba: Uint8Array | Uint8ClampedArray,
  w: number,
  h: number,
  cell: CellBox,
): boolean {
  const x1 = Math.max(0, cell.x);
  const y1 = Math.max(0, cell.y);
  const x2 = Math.min(w, cell.x + cell.w);
  const y2 = Math.min(h, cell.y + cell.h);
  if (x2 <= x1 || y2 <= y1) return false;

  const band = 4;
  const marginX = Math.floor(cell.w * 0.15);
  const marginY = Math.floor(cell.h * 0.15);
  const innerX0 = x1 + marginX;
  const innerY0 = y1 + marginY;
  const innerX1 = x2 - marginX;
  const innerY1 = y2 - marginY;

  let sumTotal = 0;
  let cntTotal = 0;
  let sumInner = 0;
  let cntInner = 0;
  let sumOuter = 0;
  let cntOuter = 0;
  for (let y = y1; y < y2; y += VALIDATE_STRIDE) {
    for (let x = x1; x < x2; x += VALIDATE_STRIDE) {
      const p = (y * w + x) * 4;
      const s = rgbToS(rgba[p], rgba[p + 1], rgba[p + 2]);
      sumTotal += s;
      cntTotal++;
      const onOuter = x < x1 + band || x >= x2 - band || y < y1 + band || y >= y2 - band;
      if (onOuter) {
        sumOuter += s;
        cntOuter++;
      } else if (x >= innerX0 && x < innerX1 && y >= innerY0 && y < innerY1) {
        sumInner += s;
        cntInner++;
      }
    }
  }
  if (cntTotal === 0 || cntInner === 0 || cntOuter === 0) return false;
  const meanS = sumTotal / cntTotal;
  if (meanS < VALIDATE_MIN_MEAN_S) return false;
  const innerS = sumInner / cntInner;
  const outerS = sumOuter / cntOuter;
  return innerS > outerS;
}

interface PeriodAttempt {
  periodX: number;
  periodY: number;
  offsetX: number;
  offsetY: number;
  cells: CellBox[];
  passRate: number; // cellHasContent 통과율
  totalCandidates: number;
}

function buildGridForPeriod(
  rgba: Uint8Array | Uint8ClampedArray,
  w: number,
  h: number,
  sx: Float32Array,
  sy: Float32Array,
  periodX: number,
  periodY: number,
): PeriodAttempt {
  const offsetX = cellStartFromCenter(estimateOffset(sx, periodX), periodX);
  const offsetY = cellStartFromCenter(estimateOffset(sy, periodY), periodY);
  const candidates: CellBox[] = [];
  for (let yIdx = 0; ; yIdx++) {
    const cy = offsetY + yIdx * periodY;
    if (cy + periodY > h) break;
    for (let xIdx = 0; ; xIdx++) {
      const cx = offsetX + xIdx * periodX;
      if (cx + periodX > w) break;
      candidates.push({ x: cx, y: cy, w: periodX, h: periodY });
    }
  }
  const passed = candidates.filter((c) => cellHasContent(rgba, w, h, c));
  return {
    periodX,
    periodY,
    offsetX,
    offsetY,
    cells: passed,
    passRate: candidates.length ? passed.length / candidates.length : 0,
    totalCandidates: candidates.length,
  };
}

/** ROI 비율 [0,1] 을 픽셀 인덱스로. 잘못된 범위는 [0, full] 로 클램프 */
function roiToPixels(range: [number, number] | undefined, full: number): [number, number] {
  if (!range) return [0, full];
  const a = Math.max(0, Math.min(full, Math.floor(range[0] * full)));
  const b = Math.max(a + 1, Math.min(full, Math.floor(range[1] * full)));
  return [a, b];
}

/**
 * 그리드 검출 메인 entry. RGBA 픽셀 → CellBox[].
 *
 * ROI 가 지정되면 그 영역 안에서만 자기상관/그리드 추출, bbox 는 원본 좌표계로 반환.
 * 모바일 인벤토리처럼 그리드가 화면 일부 (우측) 에만 있는 경우 false positive 대폭 감소.
 */
export function detectGrid(
  rgba: Uint8Array | Uint8ClampedArray,
  w: number,
  h: number,
  options?: DetectGridOptions,
): GridDetectResult {
  const [rx0, rx1] = roiToPixels(options?.roiX, w);
  const [ry0, ry1] = roiToPixels(options?.roiY, h);
  const roiW = rx1 - rx0;
  const roiH = ry1 - ry0;

  // ROI 안의 픽셀만으로 projection 계산 (sx/sy 길이는 ROI 크기)
  const sx = new Float32Array(roiW);
  const sy = new Float32Array(roiH);
  for (let y = ry0; y < ry1; y++) {
    for (let x = rx0; x < rx1; x++) {
      const p = (y * w + x) * 4;
      const max = Math.max(rgba[p], rgba[p + 1], rgba[p + 2]);
      const min = Math.min(rgba[p], rgba[p + 1], rgba[p + 2]);
      const s = max === 0 ? 0 : (max - min) / max;
      sx[x - rx0] += s;
      sy[y - ry0] += s;
    }
  }
  for (let i = 0; i < roiW; i++) sx[i] /= roiH;
  for (let i = 0; i < roiH; i++) sy[i] /= roiW;

  const maxSide = Math.floor(Math.min(roiW, roiH) * MAX_CELL_SIDE_FRAC);
  const acX = autocorrelate(sx, maxSide);
  const acY = autocorrelate(sy, maxSide);
  const candX = findCandidatePeriods(acX, MIN_CELL_SIDE, maxSide, PERIOD_CANDIDATES);
  const candY = findCandidatePeriods(acY, MIN_CELL_SIDE, maxSide, PERIOD_CANDIDATES);

  if (candX.length === 0 || candY.length === 0) {
    return { cells: [], periodX: 0, periodY: 0, offsetX: 0, offsetY: 0 };
  }

  let best: PeriodAttempt | null = null;
  let bestScore = -Infinity;
  for (const px of candX) {
    for (const py of candY) {
      const aspect = px / py;
      if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) continue;
      const attempt = buildGridForRoi(rgba, w, h, rx0, ry0, roiW, roiH, sx, sy, px, py);
      // 실제 인벤토리 셀은 보통 20-40개. 너무 적으면 over-period, 너무 많으면 sub-period.
      // n=20 이면 prior=0.8, n<25 까지 점진 penalize, 25~40 plateau, > 40 부터 penalize.
      const n = attempt.cells.length;
      const cellPrior = n < 25 ? n / 25 : n > 40 ? 40 / n : 1;
      const score = cellPrior * attempt.passRate * (px + py);
      if (score > bestScore) {
        bestScore = score;
        best = attempt;
      }
    }
  }

  if (!best) {
    return { cells: [], periodX: 0, periodY: 0, offsetX: 0, offsetY: 0 };
  }
  return {
    cells: best.cells,
    periodX: best.periodX,
    periodY: best.periodY,
    offsetX: best.offsetX,
    offsetY: best.offsetY,
  };
}

/** ROI 안에서 격자 생성 + 셀 검증. 결과 bbox 는 원본(rx0/ry0 더한) 좌표. */
function buildGridForRoi(
  rgba: Uint8Array | Uint8ClampedArray,
  w: number,
  h: number,
  rx0: number,
  ry0: number,
  roiW: number,
  roiH: number,
  sx: Float32Array,
  sy: Float32Array,
  periodX: number,
  periodY: number,
): PeriodAttempt {
  const offsetX = cellStartFromCenter(estimateOffset(sx, periodX), periodX);
  const offsetY = cellStartFromCenter(estimateOffset(sy, periodY), periodY);
  const candidates: CellBox[] = [];
  for (let yIdx = 0; ; yIdx++) {
    const cy = offsetY + yIdx * periodY;
    if (cy + periodY > roiH) break;
    for (let xIdx = 0; ; xIdx++) {
      const cx = offsetX + xIdx * periodX;
      if (cx + periodX > roiW) break;
      // 원본 좌표 환산
      candidates.push({ x: rx0 + cx, y: ry0 + cy, w: periodX, h: periodY });
    }
  }
  const passed = candidates.filter((c) => cellHasContent(rgba, w, h, c));
  return {
    periodX,
    periodY,
    offsetX: rx0 + offsetX,
    offsetY: ry0 + offsetY,
    cells: passed,
    passRate: candidates.length ? passed.length / candidates.length : 0,
    totalCandidates: candidates.length,
  };
}
