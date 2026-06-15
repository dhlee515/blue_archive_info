// PLAN_ocr_browser_matching.md Phase 0/F 검증.
// testImage/ 의 게임 스크린샷들에 OCR 파이프라인을 돌려 결과를 출력 + 통계 측정.
//
// 사용법:
//   npm run verify:ocr -- --limit 3 --cells 5      # 3장 × 셀당 첫 5개만
//   npm run verify:ocr                              # 전부

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { computeColorHist, histDistance, histScore, HIST_BINS } from '../src/lib/ocr/colorHist';
import { detectGrid, type CellBox as GridCell } from '../src/lib/ocr/gridDetection';
import { extractIconFromCellRgba } from '../src/lib/ocr/iconExtraction';
import { computePHash, hammingDistance, phashScore } from '../src/lib/ocr/phash';
import { computeHog, hogCosine, HOG_DIM } from '../src/lib/ocr/hog';
import { extractEmbeddingsTTA, embeddingCosine, EMBEDDING_DIM } from '../src/lib/ocr/embedding';
import type { OcrIndexMeta } from '../src/lib/ocr/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_ROOT = resolve(__dirname, '../src-tauri/testImage');
const INDEX_DIR = resolve(__dirname, '../public/ocr');
const MAX_LONG_EDGE = 1600;
const NORM = 96;

interface TestCategory {
  name: string;
  dir: string;
  roiX: [number, number];
}

/** 카테고리별 ROI. 모두 좌측 상세 패널 + 우측 그리드 구조 → 우측 50%. */
const CATEGORIES: TestCategory[] = [
  { name: 'mobile', dir: resolve(TEST_ROOT, 'mobile'), roiX: [0.5, 1] },
  { name: 'pc-16:9', dir: resolve(TEST_ROOT, 'pc/16.9'), roiX: [0.5, 1] },
  { name: 'pc-4:3', dir: resolve(TEST_ROOT, 'pc/4.3'), roiX: [0.5, 1] },
];

interface Index {
  meta: OcrIndexMeta;
  hists: Float32Array;
  phashes: BigUint64Array;
  hogs: Float32Array;
  embeds: Float32Array;
}

function loadIndex(): Index {
  const meta = JSON.parse(readFileSync(resolve(INDEX_DIR, 'items.json'), 'utf-8')) as OcrIndexMeta;
  const histsBuf = readFileSync(resolve(INDEX_DIR, 'hist.bin'));
  const phashBuf = readFileSync(resolve(INDEX_DIR, 'phash.bin'));
  const hogBuf = readFileSync(resolve(INDEX_DIR, 'hog.bin'));
  const embedBuf = readFileSync(resolve(INDEX_DIR, 'embed.bin'));
  return {
    meta,
    hists: new Float32Array(histsBuf.buffer, histsBuf.byteOffset, histsBuf.byteLength / 4),
    phashes: new BigUint64Array(phashBuf.buffer, phashBuf.byteOffset, phashBuf.byteLength / 8),
    hogs: new Float32Array(hogBuf.buffer, hogBuf.byteOffset, hogBuf.byteLength / 4),
    embeds: new Float32Array(embedBuf.buffer, embedBuf.byteOffset, embedBuf.byteLength / 4),
  };
}

type Cell = GridCell;

async function extractCellIcon(
  rgba: Uint8Array,
  w: number,
  h: number,
  cell: Cell,
): Promise<{ rgba: Uint8Array; gray: Uint8Array }> {
  const cellBuf = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: cell.x, top: cell.y, width: cell.w, height: cell.h })
    .raw()
    .toBuffer();
  const cellArr = new Uint8Array(cellBuf);
  const normalized = extractIconFromCellRgba(cellArr, cell.w, cell.h);
  return {
    rgba: new Uint8Array(normalized.rgba.buffer, normalized.rgba.byteOffset, normalized.rgba.byteLength),
    gray: normalized.gray,
  };
}

interface MatchOutput {
  idx: number;
  name: string;
  /** HOG cosine similarity (0~1). */
  score: number;
  histScore: number;
  phashDist: number;
}

async function matchCell(
  index: Index,
  cellRgba: Uint8Array,
  cellGray: Uint8Array,
  topK = 5,
): Promise<MatchOutput[]> {
  const cellHist = computeColorHist(cellRgba, NORM, NORM);
  const cellPhash = computePHash(cellGray, NORM, NORM);
  const cellHog = computeHog(cellGray, NORM, NORM);

  // Stage 1: hist (1253 → 500)
  const n = index.meta.entries.length;
  const stage1: { idx: number; score: number }[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const off = i * HIST_BINS;
    const slice = index.hists.subarray(off, off + HIST_BINS);
    stage1[i] = { idx: i, score: histScore(histDistance(cellHist, slice)) };
  }
  stage1.sort((a, b) => b.score - a.score);
  const stage1Top = stage1.slice(0, Math.min(500, n));

  // Stage 2: DINOv2 embedding cosine (500 → top-5). phash/hog narrow 폐기 (정답 86% 자름).
  const cellRgb = new Uint8Array(NORM * NORM * 3);
  for (let i = 0; i < NORM * NORM; i++) {
    cellRgb[i * 3] = cellRgba[i * 4];
    cellRgb[i * 3 + 1] = cellRgba[i * 4 + 1];
    cellRgb[i * 3 + 2] = cellRgba[i * 4 + 2];
  }
  const cellEmbeds = await extractEmbeddingsTTA(cellRgb, NORM);

  void cellPhash; void cellHog; // 디버그 채널 (phash/hog) 사용 안 함
  void hogCosine; void HOG_DIM; void hammingDistance; void phashScore;

  const out: MatchOutput[] = stage1Top.map((c) => {
    const off = c.idx * EMBEDDING_DIM;
    const slotEmbed = index.embeds.subarray(off, off + EMBEDDING_DIM);
    let best = -Infinity;
    for (const ce of cellEmbeds) {
      const cos = embeddingCosine(ce, slotEmbed);
      if (cos > best) best = cos;
    }
    return {
      idx: c.idx,
      name: index.meta.entries[c.idx].name,
      score: best,
      histScore: c.score,
      phashDist: 0,
    };
  });
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, topK);
}

interface ImageReport {
  file: string;
  origW: number;
  origH: number;
  scaledW: number;
  scaledH: number;
  cellCount: number;
  periodX: number;
  periodY: number;
  cellMatches: { bbox: Cell; top: MatchOutput[] }[];
  detectMs: number;
  matchMs: number;
}

async function processImage(
  index: Index,
  path: string,
  maxCells: number,
  roi: [number, number],
): Promise<ImageReport> {
  const meta = await sharp(path).metadata();
  const origW = meta.width ?? 0;
  const origH = meta.height ?? 0;
  const longEdge = Math.max(origW, origH);
  const scale = longEdge > MAX_LONG_EDGE ? MAX_LONG_EDGE / longEdge : 1;
  const w = Math.round(origW * scale);
  const h = Math.round(origH * scale);
  const rgbaBuf = await sharp(path).resize(w, h, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
  const rgba = new Uint8Array(rgbaBuf);

  const t0 = performance.now();
  const gridResult = detectGrid(rgba, w, h, { roiX: roi });
  const cells = gridResult.cells;
  const detectMs = performance.now() - t0;

  const m0 = performance.now();
  const cellMatches: ImageReport['cellMatches'] = [];
  for (const cell of cells.slice(0, maxCells)) {
    const { rgba: cellRgba, gray: cellGray } = await extractCellIcon(rgba, w, h, cell);
    const top = await matchCell(index, cellRgba, cellGray);
    cellMatches.push({ bbox: cell, top });
  }
  const matchMs = performance.now() - m0;

  return {
    file: path.split('/').pop() ?? path,
    origW,
    origH,
    scaledW: w,
    scaledH: h,
    cellCount: cells.length,
    periodX: gridResult.periodX,
    periodY: gridResult.periodY,
    cellMatches,
    detectMs,
    matchMs,
  };
}

function parseArgs(): { limit: number | null; cells: number } {
  const args = process.argv.slice(2);
  let limit: number | null = null;
  let cells = 5;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = Number(args[i + 1]);
      i++;
    } else if (args[i] === '--cells' && args[i + 1]) {
      cells = Number(args[i + 1]);
      i++;
    }
  }
  return { limit, cells };
}

async function main(): Promise<void> {
  const { limit, cells: maxCells } = parseArgs();

  console.log('인덱스 로드...');
  const index = loadIndex();
  console.log(`  → ${index.meta.entries.length} entries (HOG ${HOG_DIM}-dim 포함)`);

  const grand: ({ file: string } & SummaryRow)[] = [];

  for (const cat of CATEGORIES) {
    let allFiles: string[];
    try {
      allFiles = readdirSync(cat.dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
    } catch {
      console.log(`[skip] ${cat.name} 디렉토리 없음`);
      continue;
    }
    const files = limit !== null ? allFiles.slice(0, limit) : allFiles;
    if (files.length === 0) continue;

    console.log(`\n=== ${cat.name} (${files.length}/${allFiles.length} 장, ROI x=[${cat.roiX[0]}, ${cat.roiX[1]}]) ===`);

    const local: typeof grand = [];
    for (const f of files) {
      const path = resolve(cat.dir, f);
      try {
        const r = await processImage(index, path, maxCells, cat.roiX);
        const top1Scores = r.cellMatches.map((m) => m.top[0]?.score ?? 0);
        const top2Scores = r.cellMatches.map((m) => m.top[1]?.score ?? 0);
        const margins = r.cellMatches.map((m) => (m.top[0]?.score ?? 0) - (m.top[1]?.score ?? 0));
        const avgTop1 = top1Scores.length ? mean(top1Scores) : 0;
        const avgMargin = margins.length ? mean(margins) : 0;
        const aspectRatio = r.periodY > 0 ? r.periodX / r.periodY : 0;
        console.log(
          `${r.file.padEnd(50)} cells=${String(r.cellCount).padStart(3)}  period=${`${r.periodX}×${r.periodY}`.padEnd(9)} (asp=${aspectRatio.toFixed(2)})  top1=${avgTop1.toFixed(3)} margin=${avgMargin.toFixed(3)}`,
        );
        if (maxCells > 0 && maxCells <= 5) {
          for (const m of r.cellMatches) {
            const t = m.top[0];
            const t2 = m.top[1];
            const mg = (t?.score ?? 0) - (t2?.score ?? 0);
            console.log(`    cell(${m.bbox.x},${m.bbox.y}) → "${t?.name}" top1=${t?.score.toFixed(3)} top2=${t2?.score.toFixed(3)} (m=${mg.toFixed(3)})`);
          }
        }
        const row = { file: r.file, cellCount: r.cellCount, top1: top1Scores, top2: top2Scores, margins, periodX: r.periodX, periodY: r.periodY, durations: { detect: r.detectMs, match: r.matchMs } };
        local.push(row);
        grand.push(row);
      } catch (e) {
        console.error(`${f}  ERROR:`, e instanceof Error ? e.message : String(e));
      }
    }

    printSummary(`${cat.name} 카테고리`, local);
  }

  printSummary('전체', grand);
}

interface SummaryRow {
  cellCount: number;
  top1: number[];
  top2: number[];
  margins: number[];
  periodX: number;
  periodY: number;
  durations: { detect: number; match: number };
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor((sorted.length - 1) * p);
  return sorted[idx];
}

function printSummary(label: string, rows: SummaryRow[]): void {
  if (rows.length === 0) return;
  const cellCounts = rows.map((r) => r.cellCount);
  const allTop1 = rows.flatMap((r) => r.top1);
  const allTop2 = rows.flatMap((r) => r.top2);
  const allMargins = rows.flatMap((r) => r.margins);
  const totalDetectMs = rows.reduce((a, b) => a + b.durations.detect, 0);
  const totalMatchMs = rows.reduce((a, b) => a + b.durations.match, 0);
  const detectOk = rows.filter((r) => {
    if (r.cellCount === 0 || r.periodY === 0) return false;
    const asp = r.periodX / r.periodY;
    return asp >= 0.7 && asp <= 1.4 && r.cellCount >= 10 && r.cellCount <= 50;
  }).length;
  console.log(`\n--- 요약: ${label} (${rows.length}장) ---`);
  console.log(`  그리드 검출 정상: ${detectOk}/${rows.length} (${((detectOk / rows.length) * 100).toFixed(0)}%)`);
  console.log(`  총 검출 셀: ${cellCounts.reduce((a, b) => a + b, 0)}개`);
  if (allTop1.length > 0) {
    console.log(`  top-1 cosine: mean=${mean(allTop1).toFixed(3)}, median=${percentile(allTop1, 0.5).toFixed(3)}, p25=${percentile(allTop1, 0.25).toFixed(3)}, p75=${percentile(allTop1, 0.75).toFixed(3)}`);
    console.log(`  top-2 cosine: mean=${mean(allTop2).toFixed(3)}, median=${percentile(allTop2, 0.5).toFixed(3)}`);
    console.log(`  margin (top1-top2): mean=${mean(allMargins).toFixed(3)}, median=${percentile(allMargins, 0.5).toFixed(3)}, p25=${percentile(allMargins, 0.25).toFixed(3)}, p75=${percentile(allMargins, 0.75).toFixed(3)}`);
    for (const t of [0.02, 0.05, 0.1, 0.15, 0.2]) {
      const pass = allMargins.filter((m) => m >= t).length;
      console.log(`    margin ≥ ${t.toFixed(2)}: ${pass}/${allMargins.length} (${((pass / allMargins.length) * 100).toFixed(1)}%)`);
    }
    for (const t of [0.85, 0.7, 0.5, 0.4]) {
      const pass = allTop1.filter((n) => n >= t).length;
      console.log(`    top-1 cosine ≥ ${t.toFixed(2)}: ${pass}/${allTop1.length} (${((pass / allTop1.length) * 100).toFixed(1)}%)`);
    }
  }
  console.log(`  detect 평균 ${(totalDetectMs / rows.length).toFixed(1)}ms / match 평균 ${(totalMatchMs / rows.length).toFixed(0)}ms`);
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
