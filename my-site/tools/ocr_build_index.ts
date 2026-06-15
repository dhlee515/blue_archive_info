// SchaleDB 아이콘 → 96×96 그레이스케일 + 색히스토 + pHash 인덱스 빌드.
// PLAN_ocr_browser_matching.md Phase 1.
//
// 사용법:
//   npm run build:ocr-index           # 전체 (~1245 아이콘)
//   npm run build:ocr-index -- --limit 30   # 처음 30개만 (빠른 검증)
//
// 출력 (../public/ocr/) — Vite 정적 자산. Tauri build 시 dist/ocr/ 로 복사되어 앱 번들에 포함.
//   items.json   — 메타 + entries 리스트 (인덱스/순서/이름)
//   icons.bin    — Uint8Array, N × 96 × 96 그레이스케일
//   hist.bin     — Float32Array, N × 256 (HSV 16×4×4)
//   phash.bin    — BigUint64Array, N (64-bit pHash)
//   hog.bin      — Float32Array, N × 900 (HOG, L2 정규화)

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { computeColorHist, HIST_BINS } from '../src/lib/ocr/colorHist';
import { computePHash } from '../src/lib/ocr/phash';
import { computeHog, HOG_DIM } from '../src/lib/ocr/hog';
import { extractEmbedding, EMBEDDING_DIM, EMBEDDING_INPUT_SIZE } from '../src/lib/ocr/embedding';
import type { CatalogEntry, OcrCategory, OcrIndexMeta } from '../src/lib/ocr/types';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BASE = 'https://schaledb.com';
const REGION = 'kr';
const NORM = 96;
const CONCURRENCY = 16;
const OUT_DIR = resolve(__dirname, '../public/ocr');
/** 게임 인벤토리 셀 4-코너 평균 RGB (fallback when bg_pattern.bin 없을 때). */
const GAME_BG_R = 215;
const GAME_BG_G = 225;
const GAME_BG_B = 229;

/** _build_bg_pattern.ts 가 만든 96×96 RGBA 평균 셀 패턴 (옵션). 없으면 fallback 사용. */
function loadBgPattern(): Uint8Array | null {
  const path = resolve(OUT_DIR, 'bg_pattern.bin');
  if (!existsSync(path)) return null;
  const buf = readFileSync(path);
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

/** ocr_build_residual.ts 가 만든 96×96 RGB 잔차 맵 (옵션). 인덱스 합성 결과에
 *  픽셀별로 더해 cell 도메인에 가깝게 끌어당김. 없으면 잔차 적용 안 함. */
function loadResidual(): Float32Array | null {
  const path = resolve(OUT_DIR, 'residual.bin');
  if (!existsSync(path)) return null;
  const buf = readFileSync(path);
  const expected = NORM * NORM * 3 * 4;
  if (buf.byteLength !== expected) {
    console.warn(`residual.bin 크기 불일치 (${buf.byteLength} ≠ ${expected}) — 무시`);
    return null;
  }
  return new Float32Array(buf.buffer, buf.byteOffset, NORM * NORM * 3);
}

/** 변형(augmentation) — base 위에 추가 텍스처 (외곽 stroke / 광택 등) 를 합성한 96×96 그레이스케일.
 * 각 변형이 별도 HOG 벡터로 인덱스에 저장됨. 매칭은 max(cosine) over variants. */
type VariantFn = (composed: Uint8Array) => Uint8Array;
/** V1: identity (단색 BG 합성 그대로). */
const variantIdentity: VariantFn = (g) => g;
/** V2: 외곽 4px stroke — 게임 hex 프레임의 어두운 라인 모방. */
const variantOuterStroke: VariantFn = (g) => {
  const out = new Uint8Array(g);
  const STROKE = 4;
  const VAL = 150; // 회청색 어두운 stroke
  for (let y = 0; y < NORM; y++) {
    for (let x = 0; x < NORM; x++) {
      const onBand = x < STROKE || x >= NORM - STROKE || y < STROKE || y >= NORM - STROKE;
      if (onBand) out[y * NORM + x] = VAL;
    }
  }
  return out;
};
/** V3: 좌상 대각선 광택 — 게임 UI 흔한 highlight. */
const variantHighlight: VariantFn = (g) => {
  const out = new Uint8Array(NORM * NORM);
  const HL_REACH = NORM * 0.4;
  for (let y = 0; y < NORM; y++) {
    for (let x = 0; x < NORM; x++) {
      const d = (x + y) / 2;
      const alpha = Math.max(0, 1 - d / HL_REACH) * 0.25;
      const v = g[y * NORM + x];
      out[y * NORM + x] = Math.min(255, Math.round(v * (1 - alpha) + 255 * alpha));
    }
  }
  return out;
};

const VARIANTS: { name: string; fn: VariantFn }[] = [
  { name: 'identity', fn: variantIdentity },
];
// 변형 시도 결과 (outer-stroke, highlight) 모두 효과 없거나 regression — variants 폐기. identity 만 사용.
void variantOuterStroke;
void variantHighlight;

interface SchaleItemLike {
  Id?: number | string;
  Name?: string;
  Icon?: string;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function fetchBuffer(url: string): Promise<Buffer | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

function iconUrl(category: OcrCategory, iconField: string): string {
  return `${BASE}/images/${category}/icon/${iconField}.webp`;
}

interface BuiltSlot {
  entry: CatalogEntry;
  gray: Uint8Array;
  hist: Float32Array;
  phash: bigint;
  /** 변형 별 HOG 벡터 (V × HOG_DIM). 매칭 시 max(cosine). */
  hogVariants: Float32Array[];
  /** DINOv2-small CLS embedding (384-dim, L2 정규화). */
  embedding: Float32Array;
}

/** SchaleDB transparent 아이콘을 base 위에 alpha 합성.
 * base 는 RGBA — 픽셀의 base alpha 가 0 이면 단색 GAME_BG, alpha=255 이면 base 색 사용.
 * 외곽 frame band 만 진짜 게임 텍스처, 안쪽 (아이콘 영역) 은 단색 → SchaleDB 아이콘 그대로 보존. */
function compositeOnGameBg(rgba: Buffer, base: Uint8Array | null): { rgba: Uint8Array; gray: Uint8Array } {
  const n = NORM * NORM;
  const outRgba = new Uint8Array(n * 4);
  const outGray = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const a = rgba[i * 4 + 3] / 255;
    // base 가 있고 base alpha > 0 이면 base 색 사용. 아니면 GAME_BG 단색.
    let bgR = GAME_BG_R;
    let bgG = GAME_BG_G;
    let bgB = GAME_BG_B;
    if (base && base[i * 4 + 3] > 0) {
      bgR = base[i * 4];
      bgG = base[i * 4 + 1];
      bgB = base[i * 4 + 2];
    }
    const cr = Math.round(r * a + bgR * (1 - a));
    const cg = Math.round(g * a + bgG * (1 - a));
    const cb = Math.round(b * a + bgB * (1 - a));
    outRgba[i * 4] = cr;
    outRgba[i * 4 + 1] = cg;
    outRgba[i * 4 + 2] = cb;
    outRgba[i * 4 + 3] = 255;
    outGray[i] = Math.round(0.299 * cr + 0.587 * cg + 0.114 * cb);
  }
  return { rgba: outRgba, gray: outGray };
}

async function buildSlot(
  category: OcrCategory,
  key: string,
  name: string,
  iconField: string,
  idx: number,
  bgBase: Uint8Array | null,
  residual: Float32Array | null,
): Promise<BuiltSlot | null> {
  const buf = await fetchBuffer(iconUrl(category, iconField));
  if (!buf) return null;

  // sharp 로 96×96 RGBA (with alpha) 추출 후 게임 배경에 합성
  const raw = await sharp(buf)
    .resize(NORM, NORM, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer();
  const { rgba, gray: grayArr } = compositeOnGameBg(raw, bgBase);

  const hist = computeColorHist(rgba, NORM, NORM);
  const phash = computePHash(grayArr, NORM, NORM);
  const hogVariants = VARIANTS.map((v) => computeHog(v.fn(grayArr), NORM, NORM));

  // DINOv2 embedding — 224×224 RGB 입력. sharp 로 별도 resize (RGBA → RGB).
  // Step B 실패 (잔차 평균 mode collapse + 96→224 두번 resize 가 분포 변형) 후 원래 흐름 복원.
  void residual;
  const rgbBuf = await sharp(buf)
    .resize(EMBEDDING_INPUT_SIZE, EMBEDDING_INPUT_SIZE, { fit: 'fill' })
    .flatten({ background: { r: GAME_BG_R, g: GAME_BG_G, b: GAME_BG_B } })
    .removeAlpha()
    .raw()
    .toBuffer();
  const embedding = await extractEmbedding(new Uint8Array(rgbBuf), EMBEDDING_INPUT_SIZE);

  return {
    entry: { key, name, category, iconField, idx },
    gray: grayArr,
    hist,
    phash,
    hogVariants,
    embedding,
  };
}

async function withConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
  onProgress: (done: number, total: number) => void,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let cursor = 0;
  let done = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (cursor < tasks.length) {
      const my = cursor++;
      try {
        results[my] = await tasks[my]();
      } catch (e) {
        results[my] = null as unknown as T;
        console.error(`task ${my} failed:`, e);
      } finally {
        done++;
        if (done % 10 === 0 || done === tasks.length) onProgress(done, tasks.length);
      }
    }
  });
  await Promise.all(workers);
  return results;
}

function parseArgs(): { limit: number | null } {
  const args = process.argv.slice(2);
  let limit: number | null = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = Number(args[i + 1]);
      i++;
    }
  }
  return { limit };
}

async function main(): Promise<void> {
  const { limit } = parseArgs();
  mkdirSync(OUT_DIR, { recursive: true });

  console.log('[1/4] SchaleDB items + equipment 다운로드');
  const [items, equipment] = await Promise.all([
    fetchJson<Record<string, SchaleItemLike>>(`${BASE}/data/${REGION}/items.min.json`),
    fetchJson<Record<string, SchaleItemLike>>(`${BASE}/data/${REGION}/equipment.min.json`),
  ]);

  console.log('[2/4] 빌드 대상 수집');
  type Target = { category: OcrCategory; key: string; name: string; iconField: string };
  const targets: Target[] = [];
  for (const [k, v] of Object.entries(items)) {
    const iconField = String(v.Icon ?? k);
    targets.push({
      category: 'item',
      key: `item:${k}`,
      name: (v.Name ?? '').replace(/\n/g, ' '),
      iconField,
    });
  }
  for (const [k, v] of Object.entries(equipment)) {
    const iconField = String(v.Icon ?? k);
    targets.push({
      category: 'equipment',
      key: `equipment:${k}`,
      name: (v.Name ?? '').replace(/\n/g, ' '),
      iconField,
    });
  }
  const trimmed = limit !== null ? targets.slice(0, limit) : targets;
  console.log(`   → ${trimmed.length} / ${targets.length} 대상 (limit=${limit ?? 'none'})`);

  const bgBase = loadBgPattern();
  const residual = loadResidual();
  console.log(
    `[3/4] 아이콘 다운로드 + hist/phash/HOG/embedding 계산 (bg ${bgBase ? 'pattern' : '단색'}, residual ${residual ? 'on' : 'off'})`,
  );
  // ONNX 추론은 GPU/CPU 공유 자원 → 동시 ↑ 시 oversaturation. concurrency 낮춤.
  const EMBED_CONCURRENCY = 4;
  const tasks = trimmed.map(
    (t, idx) => () => buildSlot(t.category, t.key, t.name, t.iconField, idx, bgBase, residual),
  );
  void EMBED_CONCURRENCY; // 아래 withConcurrency 는 기존 CONCURRENCY 사용. embedding 비용 측정 후 결정.
  const slots = (await withConcurrency(tasks, CONCURRENCY, (d, tot) => {
    process.stdout.write(`\r   ${d}/${tot}`);
  })).filter((s): s is BuiltSlot => s !== null);
  process.stdout.write('\n');
  console.log(`   → ${slots.length} 슬롯 성공 / ${trimmed.length} 시도`);

  // 빈 슬롯 (404) 제거 후 idx 재할당
  slots.forEach((s, i) => {
    s.entry.idx = i;
  });

  console.log('[4/4] 바이너리 출력');
  const meta: OcrIndexMeta = {
    schaledbRevision: '',
    builtAt: new Date().toISOString(),
    region: REGION,
    normSize: NORM,
    histBins: HIST_BINS,
    hogVariants: VARIANTS.length,
    embeddingDim: EMBEDDING_DIM,
    entries: slots.map((s) => s.entry),
  };
  writeFileSync(resolve(OUT_DIR, 'items.json'), JSON.stringify(meta));

  // icons.bin: N × 96 × 96
  const grayBuf = Buffer.alloc(slots.length * NORM * NORM);
  for (let i = 0; i < slots.length; i++) {
    grayBuf.set(slots[i].gray, i * NORM * NORM);
  }
  writeFileSync(resolve(OUT_DIR, 'icons.bin'), grayBuf);

  // hist.bin: N × 256 float32
  const histBuf = Buffer.alloc(slots.length * HIST_BINS * 4);
  for (let i = 0; i < slots.length; i++) {
    Buffer.from(slots[i].hist.buffer, slots[i].hist.byteOffset, slots[i].hist.byteLength).copy(
      histBuf,
      i * HIST_BINS * 4,
    );
  }
  writeFileSync(resolve(OUT_DIR, 'hist.bin'), histBuf);

  // phash.bin: N × BigUint64 (little-endian)
  const phashBuf = Buffer.alloc(slots.length * 8);
  for (let i = 0; i < slots.length; i++) {
    phashBuf.writeBigUInt64LE(slots[i].phash, i * 8);
  }
  writeFileSync(resolve(OUT_DIR, 'phash.bin'), phashBuf);

  // hog.bin: N entries × V variants × HOG_DIM float32 (row major: entry slow, variant medium, dim fast)
  const V = VARIANTS.length;
  const hogBuf = Buffer.alloc(slots.length * V * HOG_DIM * 4);
  for (let i = 0; i < slots.length; i++) {
    for (let v = 0; v < V; v++) {
      const src = slots[i].hogVariants[v];
      Buffer.from(src.buffer, src.byteOffset, src.byteLength).copy(
        hogBuf,
        (i * V + v) * HOG_DIM * 4,
      );
    }
  }
  writeFileSync(resolve(OUT_DIR, 'hog.bin'), hogBuf);

  // embed.bin: N entries × EMBEDDING_DIM float32 (L2 정규화 → dot = cosine)
  const embedBuf = Buffer.alloc(slots.length * EMBEDDING_DIM * 4);
  for (let i = 0; i < slots.length; i++) {
    Buffer.from(slots[i].embedding.buffer, slots[i].embedding.byteOffset, slots[i].embedding.byteLength).copy(
      embedBuf,
      i * EMBEDDING_DIM * 4,
    );
  }
  writeFileSync(resolve(OUT_DIR, 'embed.bin'), embedBuf);

  const totalBytes = grayBuf.length + histBuf.length + phashBuf.length + hogBuf.length + embedBuf.length;
  console.log(`\n완료: ${OUT_DIR}`);
  console.log(`  items.json  ${meta.entries.length} entries`);
  console.log(`  icons.bin   ${(grayBuf.length / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  hist.bin    ${(histBuf.length / 1024).toFixed(1)} KB`);
  console.log(`  phash.bin   ${(phashBuf.length / 1024).toFixed(1)} KB`);
  console.log(`  hog.bin     ${(hogBuf.length / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  embed.bin   ${(embedBuf.length / 1024 / 1024).toFixed(2)} MB (DINOv2-small)`);
  console.log(`  합계         ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
