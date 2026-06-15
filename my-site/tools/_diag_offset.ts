// 진단: 현재 estimateOffset 결과 분석.
// sx, sy 1D signal 시각화 + max/min offset + period 안 alignment metric.

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { computeSaturationProjections, autocorrelate, detectGrid } from '../src/lib/ocr/gridDetection';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_ROOT = resolve(__dirname, '../src-tauri/testImage');

function rgbToS(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

/** Period P 로 sampling. 각 sample 위치(off, off+P, ...) 의 평균 S */
function meanByOffset(signal: Float32Array, period: number, off: number): number {
  let sum = 0;
  let count = 0;
  for (let pos = off; pos < signal.length; pos += period) {
    sum += signal[pos];
    count++;
  }
  return count > 0 ? sum / count : 0;
}

/** 셀 안 (margin 10%) vs 셀 외곽 (테두리 4px) 의 S 평균 차이.
 *  큰 양수 = 셀 경계가 갭 (저채도) 에 잘 정렬됨. */
function cellAlignmentScore(
  rgba: Uint8Array,
  w: number,
  h: number,
  cellX: number,
  cellY: number,
  cellW: number,
  cellH: number,
): number {
  const x0 = Math.max(0, cellX);
  const y0 = Math.max(0, cellY);
  const x1 = Math.min(w, cellX + cellW);
  const y1 = Math.min(h, cellY + cellH);
  if (x1 <= x0 || y1 <= y0) return 0;

  const band = 4;
  const marginX = Math.floor(cellW * 0.15);
  const marginY = Math.floor(cellH * 0.15);
  const innerX0 = x0 + marginX;
  const innerY0 = y0 + marginY;
  const innerX1 = x1 - marginX;
  const innerY1 = y1 - marginY;

  // 외곽 band: 4면의 4px 두께
  let outerSum = 0;
  let outerCount = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const onBand = x < x0 + band || x >= x1 - band || y < y0 + band || y >= y1 - band;
      if (!onBand) continue;
      const p = (y * w + x) * 4;
      outerSum += rgbToS(rgba[p], rgba[p + 1], rgba[p + 2]);
      outerCount++;
    }
  }

  // 내부 (margin 15% 안)
  let innerSum = 0;
  let innerCount = 0;
  for (let y = innerY0; y < innerY1; y += 2) {
    for (let x = innerX0; x < innerX1; x += 2) {
      const p = (y * w + x) * 4;
      innerSum += rgbToS(rgba[p], rgba[p + 1], rgba[p + 2]);
      innerCount++;
    }
  }

  if (outerCount === 0 || innerCount === 0) return 0;
  return innerSum / innerCount - outerSum / outerCount;
}

async function main(): Promise<void> {
  const arg = process.argv[2] ?? null;
  let relPath = arg;
  if (!relPath) {
    const mobile = readdirSync(resolve(TEST_ROOT, 'mobile')).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
    relPath = `mobile/${mobile[0]}`;
  }
  const full = resolve(TEST_ROOT, relPath!);
  const meta = await sharp(full).metadata();
  const origW = meta.width!;
  const origH = meta.height!;
  const scale = Math.min(1600 / Math.max(origW, origH), 1);
  const w = Math.round(origW * scale);
  const h = Math.round(origH * scale);
  const rgbaBuf = await sharp(full).resize(w, h, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
  const rgba = new Uint8Array(rgbaBuf);

  // 우측 50%
  const rx0 = Math.floor(w * 0.5);
  const ry0 = 0;
  const roiW = w - rx0;
  const roiH = h;
  const cropped = new Uint8Array(roiW * roiH * 4);
  for (let y = 0; y < roiH; y++) {
    for (let x = 0; x < roiW; x++) {
      const sp = (y * w + (rx0 + x)) * 4;
      const dp = (y * roiW + x) * 4;
      cropped[dp] = rgba[sp];
      cropped[dp + 1] = rgba[sp + 1];
      cropped[dp + 2] = rgba[sp + 2];
      cropped[dp + 3] = rgba[sp + 3];
    }
  }

  const { sx, sy } = computeSaturationProjections(cropped, roiW, roiH);
  const result = detectGrid(rgba, w, h, { roiX: [0.5, 1] });
  const { periodX, periodY, offsetX, offsetY, cells } = result;

  console.log(`${relPath}: ${w}×${h}, period=${periodX}×${periodY}, offset=(${offsetX},${offsetY}), ${cells.length} cells`);

  // X 축 — 모든 offset 시도 후 mean S
  const xMeans: { off: number; mean: number }[] = [];
  for (let off = 0; off < periodX; off++) {
    xMeans.push({ off, mean: meanByOffset(sx, periodX, off) });
  }
  xMeans.sort((a, b) => b.mean - a.mean);
  console.log(`\nX offset top-5 (max mean S):`);
  for (const e of xMeans.slice(0, 5)) {
    console.log(`  off=${e.off}  meanS=${e.mean.toFixed(4)}  (=> roi-cell-start=${e.off}, original-x=${rx0 + e.off})`);
  }
  console.log(`X offset bottom-5 (min mean S, = gutter):`);
  for (const e of xMeans.slice(-5).reverse()) {
    console.log(`  off=${e.off}  meanS=${e.mean.toFixed(4)}  (=> roi-cell-start=${e.off}, original-x=${rx0 + e.off})`);
  }

  // 현재 셀과 P/2 shift 한 셀의 alignment score 비교
  const halfX = Math.floor(periodX / 2);
  const halfY = Math.floor(periodY / 2);
  const shiftedX = ((offsetX - rx0 - halfX) % periodX + periodX) % periodX + rx0;
  const shiftedY = ((offsetY - ry0 - halfY) % periodY + periodY) % periodY + ry0;

  const cellsCurrent: Array<{ x: number; y: number }> = [];
  const cellsShifted: Array<{ x: number; y: number }> = [];
  for (let cy = offsetY; cy + periodY <= h; cy += periodY) {
    for (let cx = offsetX; cx + periodX <= w; cx += periodX) {
      cellsCurrent.push({ x: cx, y: cy });
    }
  }
  for (let cy = shiftedY; cy + periodY <= h; cy += periodY) {
    for (let cx = shiftedX; cx + periodX <= w; cx += periodX) {
      cellsShifted.push({ x: cx, y: cy });
    }
  }

  let sumCurrent = 0;
  let sumShifted = 0;
  for (const c of cellsCurrent) sumCurrent += cellAlignmentScore(rgba, w, h, c.x, c.y, periodX, periodY);
  for (const c of cellsShifted) sumShifted += cellAlignmentScore(rgba, w, h, c.x, c.y, periodX, periodY);
  const meanCurrent = cellsCurrent.length ? sumCurrent / cellsCurrent.length : 0;
  const meanShifted = cellsShifted.length ? sumShifted / cellsShifted.length : 0;

  console.log(`\n현재 grid (offset=${offsetX},${offsetY}, ${cellsCurrent.length} cells):`);
  console.log(`  alignmentScore mean = ${meanCurrent.toFixed(4)} (inner_S - outer_S, 큰 양수 = 잘 정렬)`);
  console.log(`P/2 shifted grid (offset=${shiftedX},${shiftedY}, ${cellsShifted.length} cells):`);
  console.log(`  alignmentScore mean = ${meanShifted.toFixed(4)}`);
  console.log(`\n→ ${meanShifted > meanCurrent ? 'SHIFTED 가 더 좋음' : '현재가 더 좋음'} (diff = ${(meanShifted - meanCurrent).toFixed(4)})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
