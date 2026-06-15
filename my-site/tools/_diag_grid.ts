// 진단: 1번 이미지의 자기상관 peak 분포 출력
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { computeSaturationProjections, autocorrelate } from '../src/lib/ocr/gridDetection';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PATH = resolve(__dirname, '../src-tauri/testImage/' + (process.argv[2] || 'mobile/KakaoTalk_Photo_2026-06-08-02-54-21-7.jpeg'));

async function main() {
  const meta = await sharp(PATH).metadata();
  const origW = meta.width!;
  const origH = meta.height!;
  const scale = Math.min(1600 / Math.max(origW, origH), 1);
  const w = Math.round(origW * scale);
  const h = Math.round(origH * scale);
  const rgbaBuf = await sharp(PATH).resize(w, h, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
  const rgba = new Uint8Array(rgbaBuf);

  // 우측 50% 만 추출
  const rx0 = Math.floor(w * 0.5);
  const rx1 = w;
  const roiW = rx1 - rx0;
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
  const maxSide = Math.floor(Math.min(roiW, roiH) * 0.4);
  const acX = autocorrelate(sx, maxSide);
  const acY = autocorrelate(sy, maxSide);

  console.log(`scaled=${w}×${h}, ROI=${roiW}×${roiH}, maxLag=${maxSide}`);
  console.log('\n=== X 자기상관 peaks (lag, ac, ac[2*lag]/ac[lag]) ===');
  for (let lag = 60; lag <= maxSide && lag + 1 < acX.length; lag++) {
    if (acX[lag] > acX[lag - 1] && acX[lag] > acX[lag + 1]) {
      const twoLag = lag * 2;
      const harm = twoLag < acX.length ? acX[twoLag] / Math.max(1e-6, acX[lag]) : 0;
      if (acX[lag] > 0.02) {
        const score = acX[lag] * (1 + harm);
        console.log(`  lag=${lag}  ac=${acX[lag].toFixed(3)}  harmonic=${harm.toFixed(2)}  score=${score.toFixed(3)}`);
      }
    }
  }
  console.log('\n=== Y 자기상관 peaks ===');
  for (let lag = 60; lag <= maxSide && lag + 1 < acY.length; lag++) {
    if (acY[lag] > acY[lag - 1] && acY[lag] > acY[lag + 1]) {
      const twoLag = lag * 2;
      const harm = twoLag < acY.length ? acY[twoLag] / Math.max(1e-6, acY[lag]) : 0;
      if (acY[lag] > 0.02) {
        const score = acY[lag] * (1 + harm);
        console.log(`  lag=${lag}  ac=${acY[lag].toFixed(3)}  harmonic=${harm.toFixed(2)}  score=${score.toFixed(3)}`);
      }
    }
  }
}

main().catch((e) => console.error(e));
