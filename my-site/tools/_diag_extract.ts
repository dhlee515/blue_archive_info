// 진단: 한 testImage 이미지에서 각 셀 → 원본 + 추출 + top-1 인덱스 아이콘을 PNG 로 덤프.
// 추출 품질이 매칭에 들어가는 입력으로 충분히 깨끗한지 시각 검증용.
//
// 사용:
//   tsx tools/_diag_extract.ts <relative-path-from-testImage>
//   기본: mobile/<첫 파일>
// 출력:
//   /tmp/ocr_debug/<filename>/cell_<x>_<y>_orig.png
//   /tmp/ocr_debug/<filename>/cell_<x>_<y>_extracted_rgba.png
//   /tmp/ocr_debug/<filename>/cell_<x>_<y>_extracted_gray.png
//   /tmp/ocr_debug/<filename>/cell_<x>_<y>_match_<name>.png

import { mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { computeColorHist, histDistance, histScore, HIST_BINS } from '../src/lib/ocr/colorHist';
import { detectGrid } from '../src/lib/ocr/gridDetection';
import { extractIconFromCellRgba } from '../src/lib/ocr/iconExtraction';
import { computePHash, hammingDistance, phashScore } from '../src/lib/ocr/phash';
import { computeHog, hogCosine, HOG_DIM } from '../src/lib/ocr/hog';
import { extractEmbedding, embeddingCosine, EMBEDDING_DIM } from '../src/lib/ocr/embedding';
import type { OcrIndexMeta } from '../src/lib/ocr/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_ROOT = resolve(__dirname, '../src-tauri/testImage');
const INDEX_DIR = resolve(__dirname, '../public/ocr');
const OUT_ROOT = '/tmp/ocr_debug';
const NORM = 96;

async function main(): Promise<void> {
  const arg = process.argv[2] ?? null;
  let relPath = arg;
  if (!relPath) {
    const mobile = readdirSync(resolve(TEST_ROOT, 'mobile')).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
    if (mobile.length === 0) throw new Error('mobile/ 에 이미지 없음');
    relPath = `mobile/${mobile[0]}`;
  }
  const full = resolve(TEST_ROOT, relPath);
  const fileLabel = relPath.replace(/[\/\\]/g, '_');
  const outDir = resolve(OUT_ROOT, fileLabel);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  // 1) 인덱스 로드
  const meta = JSON.parse(readFileSync(resolve(INDEX_DIR, 'items.json'), 'utf-8')) as OcrIndexMeta;
  const histsBuf = readFileSync(resolve(INDEX_DIR, 'hist.bin'));
  const phashBuf = readFileSync(resolve(INDEX_DIR, 'phash.bin'));
  const hogBuf = readFileSync(resolve(INDEX_DIR, 'hog.bin'));
  const iconsBuf = readFileSync(resolve(INDEX_DIR, 'icons.bin'));
  const embedBuf = readFileSync(resolve(INDEX_DIR, 'embed.bin'));
  const hists = new Float32Array(histsBuf.buffer, histsBuf.byteOffset, histsBuf.byteLength / 4);
  const phashes = new BigUint64Array(phashBuf.buffer, phashBuf.byteOffset, phashBuf.byteLength / 8);
  const hogs = new Float32Array(hogBuf.buffer, hogBuf.byteOffset, hogBuf.byteLength / 4);
  const icons = new Uint8Array(iconsBuf.buffer, iconsBuf.byteOffset, iconsBuf.byteLength);
  const embeds = new Float32Array(embedBuf.buffer, embedBuf.byteOffset, embedBuf.byteLength / 4);

  // 2) 이미지 로드 + grid 검출
  const imgMeta = await sharp(full).metadata();
  const origW = imgMeta.width!;
  const origH = imgMeta.height!;
  const longEdge = Math.max(origW, origH);
  const scale = longEdge > 1600 ? 1600 / longEdge : 1;
  const w = Math.round(origW * scale);
  const h = Math.round(origH * scale);
  const rgbaBuf = await sharp(full).resize(w, h, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
  const rgba = new Uint8Array(rgbaBuf);

  const grid = detectGrid(rgba, w, h, { roiX: [0.5, 1] });
  console.log(`${relPath}: ${w}×${h}, ${grid.cells.length} cells, period=${grid.periodX}×${grid.periodY}`);

  // 셀 일부만 (앞 10개)
  const cells = grid.cells.slice(0, 10);
  const n = meta.entries.length;

  for (const cell of cells) {
    // 셀 원본
    const cellBuf = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
      .extract({ left: cell.x, top: cell.y, width: cell.w, height: cell.h })
      .raw()
      .toBuffer();
    const cellArr = new Uint8Array(cellBuf);
    const baseName = `cell_${cell.x}_${cell.y}`;

    await sharp(cellArr, { raw: { width: cell.w, height: cell.h, channels: 4 } })
      .png()
      .toFile(resolve(outDir, `${baseName}_orig.png`));

    // 추출
    const normalized = extractIconFromCellRgba(cellArr, cell.w, cell.h);
    const extRgba = new Uint8Array(
      normalized.rgba.buffer,
      normalized.rgba.byteOffset,
      normalized.rgba.byteLength,
    );
    await sharp(extRgba, { raw: { width: NORM, height: NORM, channels: 4 } })
      .png()
      .toFile(resolve(outDir, `${baseName}_extracted_rgba.png`));

    // grayscale 도 RGBA 로 변환해 저장 (sharp 가 channels=1 입력 + png 변환)
    await sharp(normalized.gray, { raw: { width: NORM, height: NORM, channels: 1 } })
      .png()
      .toFile(resolve(outDir, `${baseName}_extracted_gray.png`));

    // 매칭 — top-3 후보까지 PNG 저장
    const cellHist = computeColorHist(extRgba, NORM, NORM);
    const cellPhash = computePHash(normalized.gray, NORM, NORM);
    const cellHog = computeHog(normalized.gray, NORM, NORM);

    const s1: { idx: number; s: number }[] = [];
    for (let i = 0; i < n; i++) {
      const off = i * HIST_BINS;
      s1.push({ idx: i, s: histScore(histDistance(cellHist, hists.subarray(off, off + HIST_BINS))) });
    }
    s1.sort((a, b) => b.s - a.s);
    const t200 = s1.slice(0, 200);
    const s2 = t200.map((c) => ({ idx: c.idx, s: phashScore(hammingDistance(cellPhash, phashes[c.idx])) }));
    s2.sort((a, b) => b.s - a.s);
    const t80 = s2.slice(0, 80);
    const s3 = t80.map((c) => {
      const off = c.idx * HOG_DIM;
      return { idx: c.idx, s: hogCosine(cellHog, hogs.subarray(off, off + HOG_DIM)) };
    });
    s3.sort((a, b) => b.s - a.s);
    const t30 = s3.slice(0, 30);

    // Stage 4: DINOv2 embedding cosine
    const cellRgb = new Uint8Array(NORM * NORM * 3);
    for (let i = 0; i < NORM * NORM; i++) {
      cellRgb[i * 3] = extRgba[i * 4];
      cellRgb[i * 3 + 1] = extRgba[i * 4 + 1];
      cellRgb[i * 3 + 2] = extRgba[i * 4 + 2];
    }
    const cellEmbed = await extractEmbedding(cellRgb, NORM);
    const top: { idx: number; s: number; name: string }[] = [];
    for (const c of t30) {
      const off = c.idx * EMBEDDING_DIM;
      const cos = embeddingCosine(cellEmbed, embeds.subarray(off, off + EMBEDDING_DIM));
      top.push({ idx: c.idx, s: cos, name: meta.entries[c.idx].name });
    }
    top.sort((a, b) => b.s - a.s);

    for (let k = 0; k < 3 && k < top.length; k++) {
      const m = top[k];
      const slotStart = m.idx * NORM * NORM;
      const slotGray = icons.subarray(slotStart, slotStart + NORM * NORM);
      const safe = m.name.replace(/[\/\\]/g, '_').replace(/[<>:"|?*]/g, '_').slice(0, 30);
      await sharp(Buffer.from(slotGray), { raw: { width: NORM, height: NORM, channels: 1 } })
        .png()
        .toFile(resolve(outDir, `${baseName}_match${k + 1}_${m.s.toFixed(3)}_${safe}.png`));
    }
    const t0 = top[0];
    const t1 = top[1];
    const margin = (t0?.s ?? 0) - (t1?.s ?? 0);
    console.log(`  cell(${cell.x},${cell.y}) ${cell.w}×${cell.h}  → "${t0?.name}" (${t0?.s.toFixed(3)})  m=${margin.toFixed(3)}`);
  }

  console.log(`\n출력: ${outDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
