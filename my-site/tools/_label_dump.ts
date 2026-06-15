// Phase A.1 — 라벨링용 셀 PNG 일괄 dump + JSON template 생성.
//
// 결과:
//   /tmp/ocr_labels/cells/{id}.png — 추출된 96×96 셀 (사용자가 보고 정답 판정)
//   /tmp/ocr_labels/cells_orig/{id}.png — 원본 셀 영역 (참고용)
//   /tmp/ocr_labels/labels.json — JSON template (사용자가 label 필드 채움)
//
// 사용자 작업: labels.json 의 각 entry 의 "label" 필드를 채움.
//   - SchaleDB 의 한국어 이름 (예: "와라쿠 공주님 부채") — fuzzy 매칭으로 키 찾음
//   - "none" — 인덱스에 정답이 없는 경우 (게임에만 존재)
//   - "unknown" — 사용자도 모르는 경우 (제외)
//   - "header" — 헤더 false positive (grid 검출 오류)
//
// 이후 _label_diag.ts 가 라벨 데이터 로드 + 정답률 측정.

import { mkdirSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { detectGrid, type CellBox } from '../src/lib/ocr/gridDetection';
import { extractIconFromCellRgba } from '../src/lib/ocr/iconExtraction';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_ROOT = resolve(__dirname, '../src-tauri/testImage');
const OUT_DIR = '/tmp/ocr_labels';
const NORM = 96;

interface LabelEntry {
  id: number;
  /** 상대 경로 (예: "mobile/foo.jpeg") */
  image: string;
  /** 셀 bbox in scaled image */
  cell: { x: number; y: number; w: number; h: number };
  /** 사용자가 채움. SchaleDB 한국어 이름 / "none" / "unknown" / "header" */
  label: string;
}

const CATEGORIES = [
  { name: 'mobile', dir: 'mobile', roiX: [0.5, 1] as [number, number] },
  { name: 'pc-16:9', dir: 'pc/16.9', roiX: [0.5, 1] as [number, number] },
  { name: 'pc-4:3', dir: 'pc/4.3', roiX: [0.5, 1] as [number, number] },
];

// 카테고리별 sample 이미지 + 셀 수
const IMAGES_PER_CAT = 3;
const CELLS_PER_IMAGE = 8;

async function main(): Promise<void> {
  rmSync(OUT_DIR, { recursive: true, force: true });
  const cellsDir = resolve(OUT_DIR, 'cells');
  const origDir = resolve(OUT_DIR, 'cells_orig');
  mkdirSync(cellsDir, { recursive: true });
  mkdirSync(origDir, { recursive: true });

  const labels: LabelEntry[] = [];
  let idCounter = 0;

  for (const cat of CATEGORIES) {
    const catDir = resolve(TEST_ROOT, cat.dir);
    let files: string[];
    try {
      files = readdirSync(catDir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
    } catch {
      console.log(`[skip] ${cat.name}`);
      continue;
    }
    const samples = files.slice(0, IMAGES_PER_CAT);
    console.log(`\n=== ${cat.name}: ${samples.length} 이미지 × ${CELLS_PER_IMAGE} 셀 ===`);

    for (const f of samples) {
      const imagePath = resolve(catDir, f);
      const meta = await sharp(imagePath).metadata();
      const origW = meta.width!;
      const origH = meta.height!;
      const sc = Math.min(1600 / Math.max(origW, origH), 1);
      const w = Math.round(origW * sc);
      const h = Math.round(origH * sc);
      const rgbaBuf = await sharp(imagePath).resize(w, h, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
      const rgba = new Uint8Array(rgbaBuf);
      const grid = detectGrid(rgba, w, h, { roiX: cat.roiX });
      const cells = grid.cells.slice(0, CELLS_PER_IMAGE);
      console.log(`  ${f}: ${cells.length} 셀`);

      for (const cell of cells) {
        const id = idCounter++;
        // 원본 셀 영역 PNG
        const origCellBuf = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
          .extract({ left: cell.x, top: cell.y, width: cell.w, height: cell.h })
          .png()
          .toBuffer();
        writeFileSync(resolve(origDir, `${id}.png`), origCellBuf);

        // 추출된 96×96 셀 PNG
        const cellArr = new Uint8Array(
          await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
            .extract({ left: cell.x, top: cell.y, width: cell.w, height: cell.h })
            .raw()
            .toBuffer(),
        );
        const normalized = extractIconFromCellRgba(cellArr, cell.w, cell.h);
        const extRgba = new Uint8Array(
          normalized.rgba.buffer,
          normalized.rgba.byteOffset,
          normalized.rgba.byteLength,
        );
        await sharp(extRgba, { raw: { width: NORM, height: NORM, channels: 4 } })
          .png()
          .toFile(resolve(cellsDir, `${id}.png`));

        labels.push({
          id,
          image: `${cat.dir}/${f}`,
          cell: { x: cell.x, y: cell.y, w: cell.w, h: cell.h },
          label: '',
        });
      }
    }
  }

  writeFileSync(resolve(OUT_DIR, 'labels.json'), JSON.stringify(labels, null, 2));
  console.log(`\n총 ${labels.length} 셀 dump 완료.`);
  console.log(`출력:`);
  console.log(`  ${cellsDir}/*.png — 추출 96×96 (매칭 입력)`);
  console.log(`  ${origDir}/*.png — 원본 셀 영역 (참고)`);
  console.log(`  ${OUT_DIR}/labels.json — 라벨 template (label 필드 채워주세요)`);
  console.log(`\n사용자 작업: labels.json 의 각 entry 의 "label" 채움`);
  console.log(`  - SchaleDB 한국어 이름 (예: "와라쿠 공주님 부채")`);
  console.log(`  - "none" — 인덱스에 정답 없음 (또는 모름)`);
  console.log(`  - "header" — 헤더 false positive`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
