// DINOv2-small CLS embedding 추출 — semantic feature 기반 매칭.
//
// 기존 HOG (gradient histogram) 은 game ↔ SchaleDB 도메인 갭을 잘 못 잡음 (margin ≤ 0.10).
// CNN/ViT embedding 은 의미론적 유사도라 광택/색감/약간의 모양 변화에 robust.
//
// 모델: Xenova/dinov2-small (ONNX, ~86MB). 224×224 입력, 출력 (1, 257, 384):
//   - patch 0 = CLS token (global representation)
// 시도 후 폐기한 모델들:
//   - DINOv2-base (768-dim, 340MB) — 큰 feature space 평탄화 → worse
//   - CLIP ViT-B/32 (512-dim, 150MB) — 모든 icon 0.8+ 로 묶임, margin catastrophic

import { pipeline, RawImage, type ImageFeatureExtractionPipeline } from '@huggingface/transformers';

/** DINOv2-small CLS 차원 — 모델 backbone 출력. */
export const RAW_EMBEDDING_DIM = 384;
/** 최종 매칭 차원. adapter 적용 시 128, 미사용 시 384 (build/index 메타에 따라). */
export const EMBEDDING_DIM = 128;
export const EMBEDDING_MODEL = 'Xenova/dinov2-small';
export const EMBEDDING_INPUT_SIZE = 224;

let pipelinePromise: Promise<ImageFeatureExtractionPipeline> | null = null;

export async function getEmbeddingPipeline(): Promise<ImageFeatureExtractionPipeline> {
  if (!pipelinePromise) {
    pipelinePromise = pipeline('image-feature-extraction', EMBEDDING_MODEL, {
      dtype: 'fp32',
    }) as Promise<ImageFeatureExtractionPipeline>;
  }
  return pipelinePromise;
}

/** RGB Uint8Array (size×size×3) → CLS embedding (RAW 384-dim, L2 정규화).
 * 모델은 224×224 학습 — 입력 크기가 다르면 내부에서 resize.
 * Adapter 적용 전 raw embedding. 매칭 시 applyAdapter() 로 128-dim 으로 투사. */
export async function extractEmbedding(rgb: Uint8Array, size: number): Promise<Float32Array> {
  const extractor = await getEmbeddingPipeline();
  let img = new RawImage(rgb, size, size, 3);
  if (size !== EMBEDDING_INPUT_SIZE) {
    img = await img.resize(EMBEDDING_INPUT_SIZE, EMBEDDING_INPUT_SIZE);
  }
  const result = await extractor(img);
  // result.data shape = [1, 257, 384] flatten = 98688 — CLS = first 384
  const full = result.data as Float32Array;
  const cls = full.slice(0, RAW_EMBEDDING_DIM);
  let sum = 0;
  for (let i = 0; i < RAW_EMBEDDING_DIM; i++) sum += cls[i] * cls[i];
  const norm = Math.sqrt(sum) || 1;
  const out = new Float32Array(RAW_EMBEDDING_DIM);
  for (let i = 0; i < RAW_EMBEDDING_DIM; i++) out[i] = cls[i] / norm;
  return out;
}

/** Linear adapter 적용: raw (384) → projection (out_dim) → L2 정규화.
 * weights 는 row-major (in_dim, out_dim) — `index_loader` 가 로드. */
export function applyAdapter(
  rawEmbed: Float32Array,
  weights: Float32Array,
  inDim: number,
  outDim: number,
): Float32Array {
  if (rawEmbed.length !== inDim) {
    throw new Error(`applyAdapter: rawEmbed dim ${rawEmbed.length} ≠ ${inDim}`);
  }
  if (weights.length !== inDim * outDim) {
    throw new Error(`applyAdapter: weights dim ${weights.length} ≠ ${inDim * outDim}`);
  }
  const out = new Float32Array(outDim);
  for (let o = 0; o < outDim; o++) {
    let s = 0;
    for (let i = 0; i < inDim; i++) {
      s += rawEmbed[i] * weights[i * outDim + o];
    }
    out[o] = s;
  }
  let sq = 0;
  for (let o = 0; o < outDim; o++) sq += out[o] * out[o];
  const n = Math.sqrt(sq) || 1;
  for (let o = 0; o < outDim; o++) out[o] /= n;
  return out;
}

/** 두 정규화된 임베딩의 cosine = dot product. 차원은 두 벡터의 length 로 결정. */
export function embeddingCosine(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += a[i] * b[i];
  return sum;
}

/** TTA: RGB 이미지를 회전 (영역 밖은 background fill).
 * angle 작을 때 (±10°) 내부 alignment 변형 흡수 — 게임 셀의 미세한 어긋남 robust. */
const TTA_BG_R = 215;
const TTA_BG_G = 225;
const TTA_BG_B = 229;
export function rotateRgb(rgb: Uint8Array, size: number, angleRad: number): Uint8Array {
  const out = new Uint8Array(size * size * 3);
  const cx = size / 2;
  const cy = size / 2;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      // inverse rotation
      const sx = cos * dx + sin * dy + cx;
      const sy = -sin * dx + cos * dy + cy;
      const sxi = Math.round(sx);
      const syi = Math.round(sy);
      const dst = (y * size + x) * 3;
      if (sxi < 0 || sxi >= size || syi < 0 || syi >= size) {
        out[dst] = TTA_BG_R;
        out[dst + 1] = TTA_BG_G;
        out[dst + 2] = TTA_BG_B;
      } else {
        const src = (syi * size + sxi) * 3;
        out[dst] = rgb[src];
        out[dst + 1] = rgb[src + 1];
        out[dst + 2] = rgb[src + 2];
      }
    }
  }
  return out;
}

/** TTA variants — 회전 ±5°/±10° 변형으로 max cosine. 147 verify 결과 효과 미미 +
 *  매칭 시간 5× 느림 (100→480ms/셀). 의도적 폐기. 단일 embedding 으로 사용. */
export const TTA_ANGLES = [0].map((d) => (d * Math.PI) / 180);

export async function extractEmbeddingsTTA(rgb: Uint8Array, size: number): Promise<Float32Array[]> {
  return [await extractEmbedding(rgb, size)];
}
