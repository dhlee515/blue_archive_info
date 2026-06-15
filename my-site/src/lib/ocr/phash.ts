// 64-bit DCT perceptual hash. ImageHash 라이브러리의 표준 phash 와 같은 형식:
//   32×32 그레이스케일 다운샘플 → 2D DCT → 좌상단 8×8 → median 기준 비트 마스크.
//
// 빌드 (Node) 와 매칭 (브라우저) 양쪽에서 import. 동일 결과 보장이 핵심.

const DCT_SIZE = 32;
const HASH_SIDE = 8;

function dct1d(input: Float64Array, n: number, out: Float64Array): void {
  for (let k = 0; k < n; k++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += input[i] * Math.cos((Math.PI * (i + 0.5) * k) / n);
    }
    out[k] = sum;
  }
}

function dct2d(input: Float64Array, n: number): Float64Array {
  const rowOut = new Float64Array(n);
  const rowBuf = new Float64Array(n);
  const rowResults = new Float64Array(n * n);
  for (let r = 0; r < n; r++) {
    for (let i = 0; i < n; i++) rowBuf[i] = input[r * n + i];
    dct1d(rowBuf, n, rowOut);
    for (let i = 0; i < n; i++) rowResults[r * n + i] = rowOut[i];
  }
  const colBuf = new Float64Array(n);
  const colOut = new Float64Array(n);
  const result = new Float64Array(n * n);
  for (let c = 0; c < n; c++) {
    for (let i = 0; i < n; i++) colBuf[i] = rowResults[i * n + c];
    dct1d(colBuf, n, colOut);
    for (let i = 0; i < n; i++) result[i * n + c] = colOut[i];
  }
  return result;
}

/**
 * 그레이스케일 픽셀 버퍼 → 64-bit pHash.
 * @param gray  단일 채널 픽셀 (0~255)
 * @param w/h   입력 해상도 (32 미만이면 동작 보장 안 됨)
 */
export function computePHash(gray: Uint8Array | Uint8ClampedArray, w: number, h: number): bigint {
  // 32×32 nearest-neighbor 다운샘플
  const sample = new Float64Array(DCT_SIZE * DCT_SIZE);
  for (let y = 0; y < DCT_SIZE; y++) {
    const sy = Math.min(h - 1, Math.floor((y * h) / DCT_SIZE));
    for (let x = 0; x < DCT_SIZE; x++) {
      const sx = Math.min(w - 1, Math.floor((x * w) / DCT_SIZE));
      sample[y * DCT_SIZE + x] = gray[sy * w + sx];
    }
  }
  const dct = dct2d(sample, DCT_SIZE);

  // 좌상단 8×8 (DC 포함). DC 제외 median 계산.
  const top = new Float64Array(HASH_SIDE * HASH_SIDE);
  for (let y = 0; y < HASH_SIDE; y++) {
    for (let x = 0; x < HASH_SIDE; x++) {
      top[y * HASH_SIDE + x] = dct[y * DCT_SIZE + x];
    }
  }
  const valuesForMedian = Array.from(top).slice(1);
  valuesForMedian.sort((a, b) => a - b);
  const median = valuesForMedian[Math.floor(valuesForMedian.length / 2)];

  let hash = 0n;
  for (let i = 0; i < 64; i++) {
    if (top[i] > median) hash |= 1n << BigInt(i);
  }
  return hash;
}

/** 64-bit hamming distance. 0~64. */
export function hammingDistance(a: bigint, b: bigint): number {
  let xor = a ^ b;
  let dist = 0;
  while (xor !== 0n) {
    if (xor & 1n) dist++;
    xor >>= 1n;
  }
  return dist;
}

/** hamming distance → 유사도 점수 0~1 */
export function phashScore(distance: number): number {
  return Math.max(0, 1 - distance / 64);
}
