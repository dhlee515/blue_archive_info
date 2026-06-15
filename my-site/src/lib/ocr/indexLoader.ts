// public/ocr/ 의 인덱스 바이너리들을 한 번 로드 후 메모리 보관.
// `loadOcrIndex()` 는 idempotent — 동시 호출 시 동일 promise 공유.

import { HIST_BINS } from './colorHist';
import { HOG_DIM } from './hog';
import { RAW_EMBEDDING_DIM } from './embedding';
import type { OcrIndexMeta } from './types';

export interface LoadedOcrIndex {
  meta: OcrIndexMeta;
  /** N × normSize × normSize. row-major. */
  icons: Uint8Array;
  /** N × HIST_BINS. row-major. */
  hists: Float32Array;
  /** N × bigint64. */
  phashes: BigUint64Array;
  /** N × HOG_DIM. row-major. L2 정규화 되어 있어 dot product = cosine. */
  hogs: Float32Array;
  /** N × meta.embeddingDim. adapter 적용된 projection (또는 raw DINOv2). L2 정규화. */
  embeds: Float32Array;
  /** Linear adapter weights (RAW_EMBEDDING_DIM, embeddingDim) row-major. 없으면 null. */
  adapter: Float32Array | null;
}

let cached: LoadedOcrIndex | null = null;
let pending: Promise<LoadedOcrIndex> | null = null;

export async function loadOcrIndex(): Promise<LoadedOcrIndex> {
  if (cached) return cached;
  if (pending) return pending;
  pending = (async () => {
    const [metaRes, iconsRes, histsRes, phashRes, hogRes, embedRes] = await Promise.all([
      fetch('/ocr/items.json'),
      fetch('/ocr/icons.bin'),
      fetch('/ocr/hist.bin'),
      fetch('/ocr/phash.bin'),
      fetch('/ocr/hog.bin'),
      fetch('/ocr/embed.bin'),
    ]);
    if (!metaRes.ok || !iconsRes.ok || !histsRes.ok || !phashRes.ok || !hogRes.ok || !embedRes.ok) {
      throw new Error('OCR 인덱스 fetch 실패 — public/ocr/ 빌드 됐는지 확인');
    }
    const meta = (await metaRes.json()) as OcrIndexMeta;
    if (meta.histBins !== HIST_BINS) {
      throw new Error(`OCR 인덱스 호환 안 됨: histBins=${meta.histBins}, 기대 ${HIST_BINS}`);
    }
    const icons = new Uint8Array(await iconsRes.arrayBuffer());
    const hists = new Float32Array(await histsRes.arrayBuffer());
    const phashes = new BigUint64Array(await phashRes.arrayBuffer());
    const hogs = new Float32Array(await hogRes.arrayBuffer());
    const embeds = new Float32Array(await embedRes.arrayBuffer());
    const n = meta.entries.length;
    if (icons.byteLength !== n * meta.normSize * meta.normSize) {
      throw new Error(`icons.bin 크기 불일치: ${icons.byteLength}`);
    }
    if (hists.length !== n * HIST_BINS) {
      throw new Error(`hist.bin 크기 불일치: ${hists.length}`);
    }
    if (phashes.length !== n) {
      throw new Error(`phash.bin 크기 불일치: ${phashes.length}`);
    }
    const expectedHog = n * (meta.hogVariants ?? 1) * HOG_DIM;
    if (hogs.length !== expectedHog) {
      throw new Error(`hog.bin 크기 불일치: ${hogs.length}, 기대 ${expectedHog} (variants=${meta.hogVariants ?? 1})`);
    }
    const embedDim = meta.embeddingDim ?? RAW_EMBEDDING_DIM;
    if (embeds.length !== n * embedDim) {
      throw new Error(`embed.bin 크기 불일치: ${embeds.length}, 기대 ${n * embedDim}`);
    }
    // Adapter (선택) — meta.adapter.enabled 시 로드
    let adapter: Float32Array | null = null;
    if (meta.adapter?.enabled) {
      const aRes = await fetch(`/ocr/${meta.adapter.weightPath || 'adapter.bin'}`);
      if (!aRes.ok) {
        throw new Error(`adapter.bin fetch 실패 (meta.adapter.enabled=true)`);
      }
      adapter = new Float32Array(await aRes.arrayBuffer());
      const expectedAd = meta.adapter.inputDim * meta.adapter.outputDim;
      if (adapter.length !== expectedAd) {
        throw new Error(`adapter.bin 크기 불일치: ${adapter.length}, 기대 ${expectedAd}`);
      }
      if (meta.adapter.outputDim !== embedDim) {
        throw new Error(`adapter outputDim (${meta.adapter.outputDim}) ≠ embeddingDim (${embedDim})`);
      }
    }
    cached = { meta, icons, hists, phashes, hogs, embeds, adapter };
    return cached;
  })();
  return pending;
}
