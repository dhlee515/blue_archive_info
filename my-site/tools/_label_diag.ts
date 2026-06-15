// Phase A.3 — 라벨 export JSON 받아 매칭 정확도 + stage 별 정답 rank 진단.
//
// 사용:
//   tsx tools/_label_diag.ts <path-to-ocr-labels-N.json>
//
// 입력 형식 (LabelPage 의 JSON export):
//   {
//     "exportedAt": "...",
//     "labels": [
//       {
//         "imageName": "foo.jpeg",
//         "imageWidth": 4000, "imageHeight": 1840,
//         "cell": { "x": 800, "y": 100, "w": 250, "h": 250 },
//         "label": "item:3023" | "none" | "header" | "unknown" | "",
//         "labelName": "..."
//       }
//     ]
//   }
//
// 진단 동작:
//   - label != "" 만 처리
//   - none/header/unknown 통계만
//   - SchaleDB key 라벨 → 인덱스에서 truthIdx 찾고 현 파이프라인 실행
//   - 정답의 hist/phash/hog/embed rank 측정 → 어느 stage 에서 잘렸는지

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { computeColorHist, histDistance, histScore, HIST_BINS } from '../src/lib/ocr/colorHist';
import { computePHash, hammingDistance, phashScore } from '../src/lib/ocr/phash';
import { computeHog, hogCosine, HOG_DIM } from '../src/lib/ocr/hog';
import { extractEmbeddingsTTA, embeddingCosine, applyAdapter, RAW_EMBEDDING_DIM } from '../src/lib/ocr/embedding';
import { detectGrid } from '../src/lib/ocr/gridDetection';
import { extractIconFromCellRgba } from '../src/lib/ocr/iconExtraction';
import type { OcrIndexMeta } from '../src/lib/ocr/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEX_DIR = resolve(__dirname, '../public/ocr');
const TEST_ROOT = resolve(__dirname, '../src-tauri/testImage');
const NORM = 96;
const MAX_LONG_EDGE = 1600;

interface LabelExport {
  exportedAt: string;
  labels: Array<{
    imageName: string;
    imageWidth: number;
    imageHeight: number;
    cell: { x: number; y: number; w: number; h: number };
    label: string;
    labelName: string;
    /** self-contained: 원본 셀 영역 (cell.w × cell.h) PNG dataURL. 있으면 이미지 원본 불필요. */
    cellDataUrl?: string;
  }>;
}

interface Index {
  meta: OcrIndexMeta;
  hists: Float32Array;
  phashes: BigUint64Array;
  hogs: Float32Array;
  embeds: Float32Array;
  /** Linear adapter (RAW_EMBEDDING_DIM, embeddingDim) — meta.adapter.enabled 시 로드. */
  adapter: Float32Array | null;
}

function loadIndex(): Index {
  const meta = JSON.parse(readFileSync(resolve(INDEX_DIR, 'items.json'), 'utf-8')) as OcrIndexMeta;
  const histsBuf = readFileSync(resolve(INDEX_DIR, 'hist.bin'));
  const phashBuf = readFileSync(resolve(INDEX_DIR, 'phash.bin'));
  const hogBuf = readFileSync(resolve(INDEX_DIR, 'hog.bin'));
  const embedBuf = readFileSync(resolve(INDEX_DIR, 'embed.bin'));
  let adapter: Float32Array | null = null;
  if (meta.adapter?.enabled) {
    const aBuf = readFileSync(resolve(INDEX_DIR, meta.adapter.weightPath || 'adapter.bin'));
    adapter = new Float32Array(aBuf.buffer, aBuf.byteOffset, aBuf.byteLength / 4);
  }
  return {
    meta,
    hists: new Float32Array(histsBuf.buffer, histsBuf.byteOffset, histsBuf.byteLength / 4),
    phashes: new BigUint64Array(phashBuf.buffer, phashBuf.byteOffset, phashBuf.byteLength / 8),
    hogs: new Float32Array(hogBuf.buffer, hogBuf.byteOffset, hogBuf.byteLength / 4),
    embeds: new Float32Array(embedBuf.buffer, embedBuf.byteOffset, embedBuf.byteLength / 4),
    adapter,
  };
}

function keyToIdx(index: Index, key: string): number | null {
  const i = index.meta.entries.findIndex((e) => e.key === key);
  return i >= 0 ? i : null;
}

/** testImage 디렉토리 안에서 imageName 찾기 (mobile/pc 등 자동 탐색) */
function findImagePath(imageName: string): string | null {
  const candidates = [
    resolve(TEST_ROOT, 'mobile', imageName),
    resolve(TEST_ROOT, 'pc/16.9', imageName),
    resolve(TEST_ROOT, 'pc/4.3', imageName),
    resolve(TEST_ROOT, imageName),
  ];
  for (const p of candidates) {
    try {
      readFileSync(p);
      return p;
    } catch {
      // continue
    }
  }
  return null;
}

interface StageRank {
  hist: number;
  phash: number;
  hog: number;
  embed: number;
}

async function rankCell(
  index: Index,
  cellRgba: Uint8Array,
  cellGray: Uint8Array,
  truthIdx: number,
): Promise<{ rank: StageRank; topName: string }> {
  const cellHist = computeColorHist(cellRgba, NORM, NORM);
  const cellPhash = computePHash(cellGray, NORM, NORM);
  const cellHog = computeHog(cellGray, NORM, NORM);
  const n = index.meta.entries.length;

  const histArr: { idx: number; score: number }[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const off = i * HIST_BINS;
    histArr[i] = { idx: i, score: histScore(histDistance(cellHist, index.hists.subarray(off, off + HIST_BINS))) };
  }
  histArr.sort((a, b) => b.score - a.score);
  const histRank = histArr.findIndex((c) => c.idx === truthIdx);

  const phashArr: { idx: number; score: number }[] = new Array(n);
  for (let i = 0; i < n; i++) {
    phashArr[i] = { idx: i, score: phashScore(hammingDistance(cellPhash, index.phashes[i])) };
  }
  phashArr.sort((a, b) => b.score - a.score);
  const phashRank = phashArr.findIndex((c) => c.idx === truthIdx);

  const V = index.meta.hogVariants ?? 1;
  const hogArr: { idx: number; score: number }[] = new Array(n);
  for (let i = 0; i < n; i++) {
    let best = -Infinity;
    for (let v = 0; v < V; v++) {
      const off = (i * V + v) * HOG_DIM;
      const slot = index.hogs.subarray(off, off + HOG_DIM);
      const cos = hogCosine(cellHog, slot);
      if (cos > best) best = cos;
    }
    hogArr[i] = { idx: i, score: best };
  }
  hogArr.sort((a, b) => b.score - a.score);
  const hogRank = hogArr.findIndex((c) => c.idx === truthIdx);

  // embedding (adapter 적용 시 cell embedding 도 384 → embeddingDim 투사)
  const cellRgb = new Uint8Array(NORM * NORM * 3);
  for (let i = 0; i < NORM * NORM; i++) {
    cellRgb[i * 3] = cellRgba[i * 4];
    cellRgb[i * 3 + 1] = cellRgba[i * 4 + 1];
    cellRgb[i * 3 + 2] = cellRgba[i * 4 + 2];
  }
  const rawCellEmbeds = await extractEmbeddingsTTA(cellRgb, NORM);
  const matchDim = index.meta.embeddingDim;
  const cellEmbeds = index.adapter
    ? rawCellEmbeds.map((e) => applyAdapter(e, index.adapter!, RAW_EMBEDDING_DIM, matchDim))
    : rawCellEmbeds;
  const embedArr: { idx: number; score: number }[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const off = i * matchDim;
    const slot = index.embeds.subarray(off, off + matchDim);
    let best = -Infinity;
    for (const ce of cellEmbeds) {
      const cos = embeddingCosine(ce, slot);
      if (cos > best) best = cos;
    }
    embedArr[i] = { idx: i, score: best };
  }
  embedArr.sort((a, b) => b.score - a.score);
  const embedRank = embedArr.findIndex((c) => c.idx === truthIdx);
  const topName = index.meta.entries[embedArr[0].idx].name;

  return { rank: { hist: histRank, phash: phashRank, hog: hogRank, embed: embedRank }, topName };
}

interface ImageCache {
  path: string;
  rgba: Uint8Array;
  w: number;
  h: number;
  origW: number;
  origH: number;
}

const imgCache = new Map<string, ImageCache>();

async function loadImage(imageName: string): Promise<ImageCache | null> {
  if (imgCache.has(imageName)) return imgCache.get(imageName)!;
  const path = findImagePath(imageName);
  if (!path) return null;
  const meta = await sharp(path).metadata();
  const origW = meta.width!;
  const origH = meta.height!;
  const sc = Math.min(MAX_LONG_EDGE / Math.max(origW, origH), 1);
  const w = Math.round(origW * sc);
  const h = Math.round(origH * sc);
  const rgbaBuf = await sharp(path).resize(w, h, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
  const cache: ImageCache = { path, rgba: new Uint8Array(rgbaBuf), w, h, origW, origH };
  imgCache.set(imageName, cache);
  return cache;
}

async function extractCellFromImage(
  cache: ImageCache,
  cellOrig: { x: number; y: number; w: number; h: number },
  imageOrigW: number,
): Promise<{ rgba: Uint8Array; gray: Uint8Array } | null> {
  // 라벨의 cell 좌표는 export 시 사용한 스케일 (MAX_LONG_EDGE=1600) 기준.
  // 이미지 cache 도 같은 스케일이라 cellOrig 좌표 그대로 사용 가능.
  // 단 라벨이 다른 스케일로 export 됐을 가능성 위해 origW 비율로 보정.
  let { x, y, w, h } = cellOrig;
  if (Math.abs(imageOrigW - cache.w) > 4 && imageOrigW > 0) {
    const r = cache.w / imageOrigW;
    x = Math.round(x * r);
    y = Math.round(y * r);
    w = Math.round(w * r);
    h = Math.round(h * r);
  }
  if (x < 0 || y < 0 || x + w > cache.w || y + h > cache.h) return null;
  const cellBuf = await sharp(cache.rgba, { raw: { width: cache.w, height: cache.h, channels: 4 } })
    .extract({ left: x, top: y, width: w, height: h })
    .raw()
    .toBuffer();
  const cellArr = new Uint8Array(cellBuf);
  const normalized = extractIconFromCellRgba(cellArr, w, h);
  return {
    rgba: new Uint8Array(normalized.rgba.buffer, normalized.rgba.byteOffset, normalized.rgba.byteLength),
    gray: normalized.gray,
  };
}

async function main(): Promise<void> {
  const jsonPaths = process.argv.slice(2);
  if (jsonPaths.length === 0) {
    console.error('사용: tsx tools/_label_diag.ts <ocr-labels-1.json> [<ocr-labels-2.json> ...]');
    process.exit(1);
  }
  const allLabels: LabelExport['labels'] = [];
  for (const p of jsonPaths) {
    const data = JSON.parse(readFileSync(p, 'utf-8')) as LabelExport;
    allLabels.push(...data.labels);
    console.log(`로드 ${p} — ${data.labels.length} 항목`);
  }
  const data = { exportedAt: '', labels: allLabels } as LabelExport;
  const labeled = data.labels.filter((l) => l.label !== '');
  if (labeled.length === 0) {
    console.log('라벨된 항목 없음');
    return;
  }

  const index = loadIndex();
  console.log(`인덱스 ${index.meta.entries.length} entries`);
  console.log(`라벨 항목: ${labeled.length} / 전체 ${data.labels.length}`);
  void detectGrid; // (unused in import path — keeps grid available for debug)

  const stats = {
    total: 0,
    none: 0,
    header: 0,
    unknown: 0,
    notFound: 0,
    correct: { top1: 0, top5: 0, top10: 0, top50: 0 },
    stageFailures: { hist: 0, phash: 0, hog: 0, embed: 0 },
    cellMissing: 0,
  };
  const rankCache: Array<StageRank & { label: string }> = [];

  for (const entry of labeled) {
    stats.total++;
    if (entry.label === 'none') {
      stats.none++;
      continue;
    }
    if (entry.label === 'header') {
      stats.header++;
      continue;
    }
    if (entry.label === 'unknown') {
      stats.unknown++;
      continue;
    }
    const truthIdx = keyToIdx(index, entry.label);
    if (truthIdx === null) {
      stats.notFound++;
      console.log(`  [WARN] key "${entry.label}" 인덱스에 없음`);
      continue;
    }

    let cell: { rgba: Uint8Array; gray: Uint8Array } | null = null;
    if (entry.cellDataUrl) {
      // self-contained — dataURL decode → 원본 셀 RGBA → iconExtraction
      const b64 = entry.cellDataUrl.split(',')[1];
      if (b64) {
        const buf = Buffer.from(b64, 'base64');
        const meta = await sharp(buf).metadata();
        const cw = meta.width!;
        const ch = meta.height!;
        const rgbaRaw = new Uint8Array(await sharp(buf).ensureAlpha().raw().toBuffer());
        const normalized = extractIconFromCellRgba(rgbaRaw, cw, ch);
        cell = {
          rgba: new Uint8Array(normalized.rgba.buffer, normalized.rgba.byteOffset, normalized.rgba.byteLength),
          gray: normalized.gray,
        };
      }
    }
    if (!cell) {
      // fallback — imageName 으로 testImage 안 검색
      const cache = await loadImage(entry.imageName);
      if (!cache) {
        stats.cellMissing++;
        console.log(`  [SKIP] ${entry.imageName} 파일 없음 + cellDataUrl 도 없음`);
        continue;
      }
      cell = await extractCellFromImage(cache, entry.cell, entry.imageWidth);
      if (!cell) {
        stats.cellMissing++;
        console.log(`  [SKIP] 셀 영역 추출 실패 (out of bounds)`);
        continue;
      }
    }
    const { rank, topName } = await rankCell(index, cell.rgba, cell.gray, truthIdx);

    if (rank.embed === 0) stats.correct.top1++;
    if (rank.embed < 5) stats.correct.top5++;
    if (rank.embed < 10) stats.correct.top10++;
    if (rank.embed < 50) stats.correct.top50++;

    // 현 파이프라인 cumulative narrow: hist 500 → phash 300 → hog 200 → embed top-5
    if (rank.hist >= 500) stats.stageFailures.hist++;
    else if (rank.phash >= 300) stats.stageFailures.phash++;
    else if (rank.hog >= 200) stats.stageFailures.hog++;
    else if (rank.embed >= 5) stats.stageFailures.embed++;

    console.log(
      `  "${entry.labelName}" → embed rank=${rank.embed + 1} (hist ${rank.hist + 1}, phash ${rank.phash + 1}, hog ${rank.hog + 1}), top-1="${topName}"`,
    );
    // narrow 시뮬레이션을 위해 rank 저장
    rankCache.push({ ...rank, label: entry.labelName });
  }

  const matched = stats.total - stats.none - stats.header - stats.unknown - stats.notFound - stats.cellMissing;
  console.log(`\n=== 종합 ===`);
  console.log(`전체 라벨: ${stats.total}`);
  console.log(`  인덱스에 정답 없음 (none): ${stats.none}`);
  console.log(`  헤더 false positive (header): ${stats.header}`);
  console.log(`  unknown: ${stats.unknown}`);
  console.log(`  key 인덱스에서 못 찾음: ${stats.notFound}`);
  console.log(`  파일/셀 누락: ${stats.cellMissing}`);
  console.log(`  매칭 시도 (인덱스 내 정답 있음): ${matched}`);
  if (matched > 0) {
    console.log(`\n정확도 (전체 1253 인덱스에 대한 embedding rank):`);
    console.log(`  top-1: ${stats.correct.top1}/${matched} (${((stats.correct.top1 / matched) * 100).toFixed(1)}%)`);
    console.log(`  top-5: ${stats.correct.top5}/${matched} (${((stats.correct.top5 / matched) * 100).toFixed(1)}%)`);
    console.log(`  top-10: ${stats.correct.top10}/${matched} (${((stats.correct.top10 / matched) * 100).toFixed(1)}%)`);
    console.log(`  top-50: ${stats.correct.top50}/${matched} (${((stats.correct.top50 / matched) * 100).toFixed(1)}%)`);
    console.log(`\n파이프라인 stage 별 정답 잘림 (cumulative: hist 500 → phash 300 → hog 200 → embed 5):`);
    console.log(`  hist 에서 잘림 (rank ≥ 500): ${stats.stageFailures.hist}`);
    console.log(`  phash 에서 잘림 (rank ≥ 300): ${stats.stageFailures.phash}`);
    console.log(`  hog 에서 잘림 (rank ≥ 200): ${stats.stageFailures.hog}`);
    console.log(`  embed 에서 잘림 (rank ≥ 5): ${stats.stageFailures.embed}`);

    // 다양한 narrow 시뮬레이션
    type Scenario = { name: string; histN: number; phashN: number; hogN: number };
    const scenarios: Scenario[] = [
      { name: '현재 (500/300/200)', histN: 500, phashN: 300, hogN: 200 },
      { name: 'phash 폐기 (500/-/200)', histN: 500, phashN: 1e9, hogN: 200 },
      { name: 'phash+hog 폐기 (500/-/-)', histN: 500, phashN: 1e9, hogN: 1e9 },
      { name: 'hist 만 (1253/-/-)', histN: 1e9, phashN: 1e9, hogN: 1e9 },
      { name: 'phash 완화 (500/1000/200)', histN: 500, phashN: 1000, hogN: 200 },
      { name: 'phash+hog 완화 (500/1000/800)', histN: 500, phashN: 1000, hogN: 800 },
    ];
    console.log(`\nNarrow scenario 시뮬레이션 — pipeline top-1 (narrow 통과 + embed top-1):`);
    for (const s of scenarios) {
      const passed = rankCache.filter((r) => r.hist < s.histN && r.phash < s.phashN && r.hog < s.hogN);
      const top1 = passed.filter((r) => r.embed === 0).length;
      const top5 = passed.filter((r) => r.embed < 5).length;
      console.log(
        `  ${s.name.padEnd(34)} : 통과 ${passed.length}/${matched}, top-1 ${top1}/${matched} (${((top1 / matched) * 100).toFixed(1)}%), top-5 ${top5}/${matched} (${((top5 / matched) * 100).toFixed(1)}%)`,
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
