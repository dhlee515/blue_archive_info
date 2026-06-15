// 라벨 cell → Xenova/dinov2-small embedding 추출 (TS 환경, 384-dim 정규화).
// 인덱스 embed (embed.384.bak.bin) 와 같은 분포에서 adapter 학습 위해.
//
// 사용:
//   tsx tools/ocr_extract_cell_embeds_ts.ts \
//     data/labels/labels-1.json [data/labels/labels-2.json ...] \
//     --out data/adapter/cell_embeds_ts.bin
//
// 출력:
//   cell_embeds_ts.bin       — Float32Array, N × 384 (정규화)
//   cell_embeds_ts.meta.json — { keys: [...], names: [...], n: N, dim: 384 }

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { extractEmbeddingsTTA, RAW_EMBEDDING_DIM } from '../src/lib/ocr/embedding';
import { extractIconFromCellRgba, NORMALIZED_SIZE } from '../src/lib/ocr/iconExtraction';
import type { OcrIndexMeta } from '../src/lib/ocr/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEX_DIR = resolve(__dirname, '../public/ocr');

interface LabelExport {
  labels: Array<{
    label: string;
    labelName: string;
    cellDataUrl?: string;
  }>;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  if (outIdx < 0 || outIdx === args.length - 1) {
    console.error('사용: tsx tools/ocr_extract_cell_embeds_ts.ts <json...> --out <path>');
    process.exit(1);
  }
  const outPath = args[outIdx + 1];
  const jsonPaths = args.slice(0, outIdx);

  // 인덱스에서 key 유효성 검증
  const meta = JSON.parse(readFileSync(resolve(INDEX_DIR, 'items.json'), 'utf-8')) as OcrIndexMeta;
  const validKeys = new Set(meta.entries.map((e) => e.key));

  // 라벨 수집
  const allLabels: LabelExport['labels'] = [];
  for (const p of jsonPaths) {
    const data = JSON.parse(readFileSync(p, 'utf-8')) as LabelExport;
    allLabels.push(...data.labels);
    console.log(`로드 ${p} — ${data.labels.length}`);
  }
  const useful = allLabels.filter(
    (l) => l.label && !['none', 'header', 'unknown'].includes(l.label) && l.cellDataUrl && validKeys.has(l.label),
  );
  console.log(`유효 라벨: ${useful.length}`);

  // 각 cell → embedding
  const N = useful.length;
  const embeds = new Float32Array(N * RAW_EMBEDDING_DIM);
  const keys: string[] = [];
  const names: string[] = [];

  for (let i = 0; i < N; i++) {
    const label = useful[i];
    const b64 = label.cellDataUrl!.split(',')[1];
    const buf = Buffer.from(b64, 'base64');
    const sm = await sharp(buf).metadata();
    const cw = sm.width!;
    const ch = sm.height!;
    const rgbaRaw = new Uint8Array(await sharp(buf).ensureAlpha().raw().toBuffer());
    const normalized = extractIconFromCellRgba(rgbaRaw, cw, ch);
    // RGBA → RGB
    const rgb = new Uint8Array(NORMALIZED_SIZE * NORMALIZED_SIZE * 3);
    for (let j = 0; j < NORMALIZED_SIZE * NORMALIZED_SIZE; j++) {
      rgb[j * 3] = normalized.rgba[j * 4];
      rgb[j * 3 + 1] = normalized.rgba[j * 4 + 1];
      rgb[j * 3 + 2] = normalized.rgba[j * 4 + 2];
    }
    const e = (await extractEmbeddingsTTA(rgb, NORMALIZED_SIZE))[0];
    embeds.set(e, i * RAW_EMBEDDING_DIM);
    keys.push(label.label);
    names.push(label.labelName ?? '');
    if ((i + 1) % 5 === 0 || i + 1 === N) {
      process.stdout.write(`\r  처리 ${i + 1}/${N}`);
    }
  }
  process.stdout.write('\n');

  // 출력
  const outAbs = resolve(outPath);
  mkdirSync(dirname(outAbs), { recursive: true });
  writeFileSync(outAbs, Buffer.from(embeds.buffer, embeds.byteOffset, embeds.byteLength));
  const metaOut = outAbs.replace(/\.bin$/, '.meta.json');
  writeFileSync(metaOut, JSON.stringify({ keys, names, n: N, dim: RAW_EMBEDDING_DIM }, null, 2));
  console.log(`\n${outAbs} (${(embeds.byteLength / 1024).toFixed(1)} KB)`);
  console.log(`${metaOut}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
