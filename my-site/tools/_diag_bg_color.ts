// testImage 의 모든 셀에서 4 코너 평균 RGB 를 수집 → 게임 셀 배경 평균 색 산출.
// 합성용 game-bg 색 결정.

import { readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { detectGrid } from '../src/lib/ocr/gridDetection';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_ROOT = resolve(__dirname, '../src-tauri/testImage');

const CATS = [
  { dir: resolve(TEST_ROOT, 'mobile'), roiX: [0.5, 1] as [number, number] },
  { dir: resolve(TEST_ROOT, 'pc/16.9'), roiX: [0.5, 1] as [number, number] },
  { dir: resolve(TEST_ROOT, 'pc/4.3'), roiX: [0.5, 1] as [number, number] },
];

const CORNER = 4;

interface RGB { r: number; g: number; b: number; n: number }

function accCorner(rgba: Uint8Array, w: number, h: number, x0: number, y0: number, acc: RGB): void {
  for (let dy = 0; dy < CORNER; dy++) {
    for (let dx = 0; dx < CORNER; dx++) {
      const x = x0 + dx;
      const y = y0 + dy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const p = (y * w + x) * 4;
      acc.r += rgba[p];
      acc.g += rgba[p + 1];
      acc.b += rgba[p + 2];
      acc.n++;
    }
  }
}

async function main(): Promise<void> {
  const overall: RGB = { r: 0, g: 0, b: 0, n: 0 };
  const perCat: Array<{ name: string; rgb: RGB; cellCount: number }> = [];

  for (const cat of CATS) {
    let files: string[];
    try {
      files = readdirSync(cat.dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
    } catch {
      continue;
    }
    const catRgb: RGB = { r: 0, g: 0, b: 0, n: 0 };
    let cellTotal = 0;
    for (const f of files) {
      const meta = await sharp(resolve(cat.dir, f)).metadata();
      const ow = meta.width!;
      const oh = meta.height!;
      const sc = Math.min(1600 / Math.max(ow, oh), 1);
      const w = Math.round(ow * sc);
      const h = Math.round(oh * sc);
      const buf = await sharp(resolve(cat.dir, f)).resize(w, h, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
      const rgba = new Uint8Array(buf);
      const grid = detectGrid(rgba, w, h, { roiX: cat.roiX });
      for (const cell of grid.cells) {
        accCorner(rgba, w, h, cell.x, cell.y, catRgb);
        accCorner(rgba, w, h, cell.x + cell.w - CORNER, cell.y, catRgb);
        accCorner(rgba, w, h, cell.x, cell.y + cell.h - CORNER, catRgb);
        accCorner(rgba, w, h, cell.x + cell.w - CORNER, cell.y + cell.h - CORNER, catRgb);
        cellTotal++;
      }
    }
    perCat.push({ name: cat.dir.split('/').slice(-2).join('/'), rgb: catRgb, cellCount: cellTotal });
    overall.r += catRgb.r;
    overall.g += catRgb.g;
    overall.b += catRgb.b;
    overall.n += catRgb.n;
  }

  for (const c of perCat) {
    if (c.rgb.n === 0) {
      console.log(`${c.name}: no cells`);
      continue;
    }
    console.log(
      `${c.name}: ${c.cellCount} cells, avg corner RGB = (${(c.rgb.r / c.rgb.n).toFixed(1)}, ${(c.rgb.g / c.rgb.n).toFixed(1)}, ${(c.rgb.b / c.rgb.n).toFixed(1)})`,
    );
  }
  console.log(
    `\n총 cell ${perCat.reduce((a, b) => a + b.cellCount, 0)}, 전체 평균 RGB = (${(overall.r / overall.n).toFixed(0)}, ${(overall.g / overall.n).toFixed(0)}, ${(overall.b / overall.n).toFixed(0)})`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
