// 셀에서 hex 프레임 + 배경을 자동 제거하고 깨끗한 아이콘 영역만 추출.
// PLAN_ocr_browser_matching.md §3.5.
//
// 셀 안 구조:
//   ┌─────────────────┐
//   │ ░░░░░░░░░░░░░░ │  ← hex 프레임 + 배경 (4 코너 픽셀이 보통 이 색)
//   │ ░ ┌────────┐ ░ │
//   │ ░ │ 아이콘  │ ░ │  ← 4 코너 배경과 거리 큰 픽셀 = 아이콘
//   │ ░ └────────┘ ░ │
//   │ ░░ x123  ░░░░░ │  ← 하단 ~25% 카운트 텍스트 (작업 영역에서 제외)
//   └─────────────────┘
//
// pure TS — Node 검증 / 브라우저 매칭 양쪽에서 사용.

import type { CellBox } from './gridDetection';

export const NORMALIZED_SIZE = 96;

export interface NormalizedCell {
  rgba: Uint8ClampedArray;
  gray: Uint8Array;
  size: number;
}

/** 셀 하단 25% 는 카운트 텍스트 영역 — 아이콘 추출에서 제외 */
const COUNT_RATIO = 0.25;
/** 4 코너에서 평균 추출 시 사용할 한 코너 한 변 크기 (px) */
const CORNER_SAMPLE = 4;
/** 픽셀 ↔ 배경 RGB 거리 임계값 (제곱합) — 작을수록 더 많은 픽셀이 아이콘으로 분류 */
const FG_DIST_SQ = 60 * 60;
/** bbox 추가 마진 (전경 픽셀 영역의 ratio) */
const BBOX_MARGIN = 0.05;
/** bbox 면적이 작업 영역의 이 비율 미만이면 추출 실패로 간주 → 중앙 60% fallback */
const MIN_BBOX_RATIO = 0.05;
const MAX_BBOX_RATIO = 0.95;

/** sx, sy, ex, ey 4 코너에서 각 변 CORNER_SAMPLE 길이의 평균 RGB */
function estimateBackground(
  rgba: Uint8Array | Uint8ClampedArray,
  w: number,
  h: number,
): { r: number; g: number; b: number } {
  const corners = [
    { x: 0, y: 0 },
    { x: w - CORNER_SAMPLE, y: 0 },
    { x: 0, y: h - CORNER_SAMPLE },
    { x: w - CORNER_SAMPLE, y: h - CORNER_SAMPLE },
  ];
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;
  for (const c of corners) {
    for (let dy = 0; dy < CORNER_SAMPLE; dy++) {
      for (let dx = 0; dx < CORNER_SAMPLE; dx++) {
        const x = c.x + dx;
        const y = c.y + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const p = (y * w + x) * 4;
        sumR += rgba[p];
        sumG += rgba[p + 1];
        sumB += rgba[p + 2];
        count++;
      }
    }
  }
  return count > 0
    ? { r: sumR / count, g: sumG / count, b: sumB / count }
    : { r: 0, g: 0, b: 0 };
}

/** 전경 픽셀들의 bbox. 픽셀 = 배경에서 거리 > FG_DIST_SQ 인 픽셀. */
function foregroundBbox(
  rgba: Uint8Array | Uint8ClampedArray,
  w: number,
  h: number,
  bg: { r: number; g: number; b: number },
): { x: number; y: number; w: number; h: number } | null {
  let xmin = w;
  let ymin = h;
  let xmax = -1;
  let ymax = -1;
  let count = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      const dr = rgba[p] - bg.r;
      const dg = rgba[p + 1] - bg.g;
      const db = rgba[p + 2] - bg.b;
      const distSq = dr * dr + dg * dg + db * db;
      if (distSq > FG_DIST_SQ) {
        if (x < xmin) xmin = x;
        if (y < ymin) ymin = y;
        if (x > xmax) xmax = x;
        if (y > ymax) ymax = y;
        count++;
      }
    }
  }
  if (count === 0 || xmax < 0) return null;
  return { x: xmin, y: ymin, w: xmax - xmin + 1, h: ymax - ymin + 1 };
}

/** 작업 영역 RGBA + 좌상단 좌표 → 정사각형 패딩 + 96×96 정규화 → RGBA + grayscale */
function normalizeRoi(
  rgba: Uint8Array | Uint8ClampedArray,
  w: number,
  h: number,
  roi: { x: number; y: number; w: number; h: number },
): NormalizedCell {
  // 정사각형 패딩 — 짧은 변을 긴 변에 맞춤 (중앙 정렬)
  const side = Math.max(roi.w, roi.h);
  const padX = Math.floor((side - roi.w) / 2);
  const padY = Math.floor((side - roi.h) / 2);
  const src = new Uint8Array(side * side * 4);
  // 배경(검정)으로 초기화 (Uint8Array 기본 0)
  for (let y = 0; y < roi.h; y++) {
    const sy = roi.y + y;
    if (sy < 0 || sy >= h) continue;
    for (let x = 0; x < roi.w; x++) {
      const sx = roi.x + x;
      if (sx < 0 || sx >= w) continue;
      const sp = (sy * w + sx) * 4;
      const dp = ((y + padY) * side + (x + padX)) * 4;
      src[dp] = rgba[sp];
      src[dp + 1] = rgba[sp + 1];
      src[dp + 2] = rgba[sp + 2];
      src[dp + 3] = rgba[sp + 3];
    }
  }

  // side × side → NORMALIZED_SIZE × NORMALIZED_SIZE (nearest)
  const N = NORMALIZED_SIZE;
  const outRgba = new Uint8ClampedArray(N * N * 4);
  const outGray = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) {
    const sy = Math.min(side - 1, Math.floor((y * side) / N));
    for (let x = 0; x < N; x++) {
      const sx = Math.min(side - 1, Math.floor((x * side) / N));
      const sp = (sy * side + sx) * 4;
      const dp = (y * N + x) * 4;
      const r = src[sp];
      const g = src[sp + 1];
      const b = src[sp + 2];
      const a = src[sp + 3];
      outRgba[dp] = r;
      outRgba[dp + 1] = g;
      outRgba[dp + 2] = b;
      outRgba[dp + 3] = a;
      outGray[y * N + x] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }
  }
  return { rgba: outRgba, gray: outGray, size: N };
}

/**
 * RGBA 셀 영역 → 깨끗한 아이콘 96×96 (RGBA + grayscale).
 *
 * 우선 4 코너 평균을 배경색으로 추정, 거리 임계값으로 전경 마스크 → bbox 추출.
 * bbox 가 너무 작거나 클 경우 중앙 60% crop 으로 폴백.
 */
export function extractIconFromCellRgba(
  cellRgba: Uint8Array | Uint8ClampedArray,
  cellW: number,
  cellH: number,
): NormalizedCell {
  const workH = Math.max(1, Math.floor(cellH * (1 - COUNT_RATIO)));
  // 작업 영역 = 셀 상단 (1 - COUNT_RATIO)
  const workSize = cellW * workH * 4;
  const work = new Uint8Array(workSize);
  for (let y = 0; y < workH; y++) {
    const sOff = y * cellW * 4;
    const dOff = y * cellW * 4;
    work.set(cellRgba.subarray(sOff, sOff + cellW * 4), dOff);
  }

  const bg = estimateBackground(work, cellW, workH);
  const bbox = foregroundBbox(work, cellW, workH, bg);

  const workArea = cellW * workH;
  const bboxArea = bbox ? bbox.w * bbox.h : 0;
  const ratio = bboxArea / workArea;
  const useBbox = bbox && ratio >= MIN_BBOX_RATIO && ratio <= MAX_BBOX_RATIO;

  if (useBbox && bbox) {
    const mx = Math.floor(bbox.w * BBOX_MARGIN);
    const my = Math.floor(bbox.h * BBOX_MARGIN);
    const x = Math.max(0, bbox.x - mx);
    const y = Math.max(0, bbox.y - my);
    const w = Math.min(cellW - x, bbox.w + 2 * mx);
    const h = Math.min(workH - y, bbox.h + 2 * my);
    return normalizeRoi(work, cellW, workH, { x, y, w, h });
  }

  // fallback: 작업 영역 중앙 60%
  const cx = Math.floor(cellW * 0.2);
  const cy = Math.floor(workH * 0.2);
  const cw = Math.floor(cellW * 0.6);
  const ch = Math.floor(workH * 0.6);
  return normalizeRoi(work, cellW, workH, { x: cx, y: cy, w: cw, h: ch });
}

/**
 * (브라우저 전용) 스크린샷 + 셀 좌표 → 깨끗한 아이콘 96×96.
 * 셀 영역을 canvas getImageData 로 추출 후 extractIconFromCellRgba 호출.
 */
export function extractIcon(
  screenshot: HTMLImageElement | HTMLCanvasElement,
  cell: CellBox,
): NormalizedCell {
  const canvas = document.createElement('canvas');
  canvas.width = cell.w;
  canvas.height = cell.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('extractIcon: canvas 2d unavailable');
  ctx.drawImage(screenshot, cell.x, cell.y, cell.w, cell.h, 0, 0, cell.w, cell.h);
  const imgData = ctx.getImageData(0, 0, cell.w, cell.h);
  const data = new Uint8Array(imgData.data.buffer, imgData.data.byteOffset, imgData.data.byteLength);
  return extractIconFromCellRgba(data, cell.w, cell.h);
}
