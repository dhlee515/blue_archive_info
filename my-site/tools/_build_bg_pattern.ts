// testImage 의 모든 진짜 셀을 96×96 으로 평균화 → 게임 셀 background 패턴 생성.
// 결과를 public/ocr/bg_pattern.bin (Uint8Array, 96×96×4 RGBA) 으로 저장.
// ocr_build_index.ts 가 이 파일을 읽어 SchaleDB 아이콘 합성 base 로 사용.

import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { detectGrid } from '../src/lib/ocr/gridDetection';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_ROOT = resolve(__dirname, '../src-tauri/testImage');
const OUT_DIR = resolve(__dirname, '../public/ocr');
const NORM = 96;

const CATS = [
  { dir: resolve(TEST_ROOT, 'mobile'), roiX: [0.5, 1] as [number, number] },
  { dir: resolve(TEST_ROOT, 'pc/16.9'), roiX: [0.5, 1] as [number, number] },
  { dir: resolve(TEST_ROOT, 'pc/4.3'), roiX: [0.5, 1] as [number, number] },
];

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const accR = new Float64Array(NORM * NORM);
  const accG = new Float64Array(NORM * NORM);
  const accB = new Float64Array(NORM * NORM);
  let cellCount = 0;

  for (const cat of CATS) {
    let files: string[];
    try {
      files = readdirSync(cat.dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
    } catch {
      continue;
    }
    for (const f of files) {
      const path = resolve(cat.dir, f);
      const meta = await sharp(path).metadata();
      const ow = meta.width!;
      const oh = meta.height!;
      const sc = Math.min(1600 / Math.max(ow, oh), 1);
      const w = Math.round(ow * sc);
      const h = Math.round(oh * sc);
      const buf = await sharp(path).resize(w, h, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
      const rgba = new Uint8Array(buf);
      const grid = detectGrid(rgba, w, h, { roiX: cat.roiX });
      for (const cell of grid.cells) {
        // 셀을 96×96 으로 resize
        const cellBuf = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
          .extract({ left: cell.x, top: cell.y, width: cell.w, height: cell.h })
          .resize(NORM, NORM, { fit: 'fill' })
          .removeAlpha()
          .raw()
          .toBuffer();
        for (let i = 0; i < NORM * NORM; i++) {
          accR[i] += cellBuf[i * 3];
          accG[i] += cellBuf[i * 3 + 1];
          accB[i] += cellBuf[i * 3 + 2];
        }
        cellCount++;
      }
    }
  }

  if (cellCount === 0) throw new Error('진짜 셀 없음');
  console.log(`평균화 셀: ${cellCount}`);

  // 평균 → 96×96 RGBA. 단 외곽 frame band (margin 0-15%) 만 alpha=255,
  // 안쪽 (아이콘 영역) 은 alpha=0 → 인덱스 빌드 시 SchaleDB 아이콘이 그대로 보임.
  // 이전 V2 패턴 시도가 worse 였던 이유: 안쪽도 평균화돼서 아이콘 영역에 노이즈.
  const pattern = new Uint8Array(NORM * NORM * 4);
  const MARGIN_RATIO = 0.15;
  const innerMin = Math.floor(NORM * MARGIN_RATIO);
  const innerMax = NORM - innerMin;
  for (let y = 0; y < NORM; y++) {
    for (let x = 0; x < NORM; x++) {
      const i = y * NORM + x;
      const isFrame = x < innerMin || x >= innerMax || y < innerMin || y >= innerMax;
      pattern[i * 4] = Math.round(accR[i] / cellCount);
      pattern[i * 4 + 1] = Math.round(accG[i] / cellCount);
      pattern[i * 4 + 2] = Math.round(accB[i] / cellCount);
      pattern[i * 4 + 3] = isFrame ? 255 : 0;
    }
  }

  // 진단용 PNG
  await sharp(pattern, { raw: { width: NORM, height: NORM, channels: 4 } })
    .png()
    .toFile(resolve(OUT_DIR, 'bg_pattern.png'));
  // 빌드 base 용 raw bin
  writeFileSync(resolve(OUT_DIR, 'bg_pattern.bin'), Buffer.from(pattern));
  console.log(`출력: ${resolve(OUT_DIR, 'bg_pattern.png')}, ${resolve(OUT_DIR, 'bg_pattern.bin')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
