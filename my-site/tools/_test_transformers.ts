// Transformers.js Node 환경 동작 검증 — 모델 로드 + 1 이미지 embedding 추출.
import { pipeline, RawImage } from '@huggingface/transformers';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const modelId = process.argv[2] || 'Xenova/dinov2-base';
  console.log(`모델 로드 중 (${modelId}, 첫 실행 시 다운로드)...`);
  const start = Date.now();
  const extractor = await pipeline('image-feature-extraction', modelId, {
    dtype: 'fp32',
  });
  console.log(`로드 완료: ${Date.now() - start}ms`);

  // testImage 한 장의 셀 영역 추출
  const path = resolve(__dirname, '../src-tauri/testImage/mobile/KakaoTalk_Photo_2026-06-08-02-54-21-1.jpeg');
  const buf = readFileSync(path);
  // 96×96 cell 영역 임의 추출 (전체 이미지 resize)
  const rgba = await sharp(buf).resize(224, 224, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  const rawImg = new RawImage(new Uint8Array(rgba), 224, 224, 3);

  const t0 = Date.now();
  const result = await extractor(rawImg, { pooling: 'mean', normalize: true });
  console.log(`embedding 추출 (mean+normalize): ${Date.now() - t0}ms, dim=${result.data.length}`);
  console.log(`first 8 values:`, Array.from(result.data.slice(0, 8) as Float32Array).map((v: number) => v.toFixed(4)));

  const t1 = Date.now();
  const result2 = await extractor(rawImg);
  console.log(`embedding (no pooling): ${Date.now() - t1}ms, dim=${result2.data.length}, shape=${(result2.dims as number[]).join('x')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
