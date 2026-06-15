// Step B — 렌더링 역산 (residual averaging).
//
// 라벨 (cell, GT iconField) 쌍에서 픽셀별 잔차를 평균내어 도메인 갭을
// 추출. 인덱스 합성에 이 잔차를 더하면 game-rendered cell 과 더 비슷한
// 입력이 됨 → embedding 도메인 갭 ↓.
//
// 입력:
//   tsx tools/ocr_build_residual.ts data/labels/labels-*.json
//
// 출력:
//   public/ocr/residual.bin — Float32Array, 96 × 96 × 3 (RGB delta per pixel)
//   public/ocr/residual.meta.json — {sourceLabels, sampleCount, normSize}
//
// 잔차 공간:
//   - cell: extractIconFromCellRgba 거친 96×96 RGB (bbox crop + pad + resize)
//   - icon: compositeOnGameBg 거친 96×96 RGB (alpha → 단색 BG 합성)
//   둘 다 같은 매칭 도메인. 잔차 = mean(cell - icon) over labeled pairs.
//
// 적용:
//   인덱스 빌드 시 96 RGB 합성 → 잔차 더하기 → clamp [0,255] → 224 resize → embedding.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { extractIconFromCellRgba } from '../src/lib/ocr/iconExtraction';
import type { OcrIndexMeta } from '../src/lib/ocr/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../public/ocr');
const INDEX_DIR = OUT_DIR;
const NORM = 96;
const BASE = 'https://schaledb.com';
const GAME_BG_R = 215;
const GAME_BG_G = 225;
const GAME_BG_B = 229;

interface LabelExport {
  exportedAt: string;
  labels: Array<{
    imageName: string;
    cell: { x: number; y: number; w: number; h: number };
    label: string;
    labelName: string;
    cellDataUrl?: string;
  }>;
}

function loadIndexMeta(): OcrIndexMeta {
  return JSON.parse(readFileSync(resolve(INDEX_DIR, 'items.json'), 'utf-8')) as OcrIndexMeta;
}

function iconUrl(category: string, iconField: string): string {
  return `${BASE}/images/${category}/icon/${iconField}.webp`;
}

async function fetchIconRgb(category: string, iconField: string): Promise<Uint8Array | null> {
  const res = await fetch(iconUrl(category, iconField));
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  const raw = await sharp(buf)
    .resize(NORM, NORM, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer();
  // alpha 합성 → 단색 게임 BG → 96×96 RGB
  const rgb = new Uint8Array(NORM * NORM * 3);
  for (let i = 0; i < NORM * NORM; i++) {
    const r = raw[i * 4];
    const g = raw[i * 4 + 1];
    const b = raw[i * 4 + 2];
    const a = raw[i * 4 + 3] / 255;
    rgb[i * 3] = Math.round(r * a + GAME_BG_R * (1 - a));
    rgb[i * 3 + 1] = Math.round(g * a + GAME_BG_G * (1 - a));
    rgb[i * 3 + 2] = Math.round(b * a + GAME_BG_B * (1 - a));
  }
  return rgb;
}

async function cellTo96Rgb(dataUrl: string): Promise<Uint8Array | null> {
  const b64 = dataUrl.split(',')[1];
  if (!b64) return null;
  const buf = Buffer.from(b64, 'base64');
  const meta = await sharp(buf).metadata();
  const cw = meta.width!;
  const ch = meta.height!;
  const rgbaRaw = new Uint8Array(await sharp(buf).ensureAlpha().raw().toBuffer());
  const normalized = extractIconFromCellRgba(rgbaRaw, cw, ch);
  // normalized.rgba 는 RGBA → RGB 만 추출
  const rgb = new Uint8Array(NORM * NORM * 3);
  for (let i = 0; i < NORM * NORM; i++) {
    rgb[i * 3] = normalized.rgba[i * 4];
    rgb[i * 3 + 1] = normalized.rgba[i * 4 + 1];
    rgb[i * 3 + 2] = normalized.rgba[i * 4 + 2];
  }
  return rgb;
}

interface IndexEntry {
  category: string;
  iconField: string;
  name: string;
}

async function main(): Promise<void> {
  const jsonPaths = process.argv.slice(2);
  if (jsonPaths.length === 0) {
    console.error('사용: tsx tools/ocr_build_residual.ts <ocr-labels-1.json> [<ocr-labels-2.json> ...]');
    process.exit(1);
  }

  const meta = loadIndexMeta();
  const keyToEntry = new Map<string, IndexEntry>();
  for (const e of meta.entries) {
    keyToEntry.set(e.key, { category: e.category, iconField: e.iconField, name: e.name });
  }

  const allLabels: LabelExport['labels'] = [];
  for (const p of jsonPaths) {
    const data = JSON.parse(readFileSync(p, 'utf-8')) as LabelExport;
    allLabels.push(...data.labels);
    console.log(`로드 ${p} — ${data.labels.length} 항목`);
  }
  const useful = allLabels.filter(
    (l) => l.label && !['none', 'header', 'unknown'].includes(l.label) && l.cellDataUrl,
  );
  console.log(`잔차 추출 대상: ${useful.length} (전체 ${allLabels.length})`);

  // 잔차 누적
  const sum = new Float64Array(NORM * NORM * 3);
  let count = 0;
  // iconField 별 cache (같은 GT 가 여러번 라벨될 가능성 — 캐싱 효과 미미하지만 안전)
  const iconCache = new Map<string, Uint8Array>();
  const skipped: string[] = [];

  for (const entry of useful) {
    const meta = keyToEntry.get(entry.label);
    if (!meta) {
      skipped.push(`${entry.label} (인덱스 없음)`);
      continue;
    }
    let iconRgb = iconCache.get(entry.label);
    if (!iconRgb) {
      const fetched = await fetchIconRgb(meta.category, meta.iconField);
      if (!fetched) {
        skipped.push(`${entry.label} (fetch 실패)`);
        continue;
      }
      iconRgb = fetched;
      iconCache.set(entry.label, iconRgb);
    }
    const cellRgb = await cellTo96Rgb(entry.cellDataUrl!);
    if (!cellRgb) {
      skipped.push(`${entry.label} (cell decode 실패)`);
      continue;
    }
    // 픽셀별 잔차 누적
    for (let i = 0; i < NORM * NORM * 3; i++) {
      sum[i] += cellRgb[i] - iconRgb[i];
    }
    count++;
    process.stdout.write(`\r  처리 ${count}/${useful.length}`);
  }
  process.stdout.write('\n');

  if (count === 0) {
    console.error('잔차 추출 실패 — 유효 sample 0');
    process.exit(1);
  }

  // 평균
  const residual = new Float32Array(NORM * NORM * 3);
  for (let i = 0; i < NORM * NORM * 3; i++) residual[i] = sum[i] / count;

  // 통계 — 채널별 mean / max abs
  let meanR = 0, meanG = 0, meanB = 0;
  let maxAbs = 0;
  for (let i = 0; i < NORM * NORM; i++) {
    meanR += residual[i * 3];
    meanG += residual[i * 3 + 1];
    meanB += residual[i * 3 + 2];
    const m = Math.max(Math.abs(residual[i * 3]), Math.abs(residual[i * 3 + 1]), Math.abs(residual[i * 3 + 2]));
    if (m > maxAbs) maxAbs = m;
  }
  const px = NORM * NORM;
  console.log(`\n잔차 통계 (sample ${count}):`);
  console.log(`  채널 평균 ΔR=${(meanR / px).toFixed(2)}  ΔG=${(meanG / px).toFixed(2)}  ΔB=${(meanB / px).toFixed(2)}`);
  console.log(`  픽셀별 max |Δ| = ${maxAbs.toFixed(1)}`);
  if (skipped.length > 0) {
    console.log(`  skipped: ${skipped.length}`);
    for (const s of skipped) console.log(`    - ${s}`);
  }

  // 출력
  mkdirSync(OUT_DIR, { recursive: true });
  const buf = Buffer.from(residual.buffer, residual.byteOffset, residual.byteLength);
  writeFileSync(resolve(OUT_DIR, 'residual.bin'), buf);
  writeFileSync(
    resolve(OUT_DIR, 'residual.meta.json'),
    JSON.stringify(
      {
        sourceLabels: jsonPaths.map((p) => p.split('/').pop()),
        sampleCount: count,
        normSize: NORM,
        builtAt: new Date().toISOString(),
        channelMean: { r: meanR / px, g: meanG / px, b: meanB / px },
        maxAbs,
      },
      null,
      2,
    ),
  );

  // 시각화 (debug) — 잔차를 픽셀로 변환해서 PNG 저장
  const vis = new Uint8Array(NORM * NORM * 3);
  for (let i = 0; i < NORM * NORM * 3; i++) {
    // 중심 128 + 잔차 (확대 ×2 로 가시화)
    const v = 128 + residual[i] * 2;
    vis[i] = Math.max(0, Math.min(255, Math.round(v)));
  }
  await sharp(vis, { raw: { width: NORM, height: NORM, channels: 3 } })
    .png()
    .toFile(resolve(OUT_DIR, 'residual_vis.png'));

  console.log(`\n출력:`);
  console.log(`  ${resolve(OUT_DIR, 'residual.bin')} (${(buf.length / 1024).toFixed(1)} KB)`);
  console.log(`  ${resolve(OUT_DIR, 'residual.meta.json')}`);
  console.log(`  ${resolve(OUT_DIR, 'residual_vis.png')} (debug 시각화)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
