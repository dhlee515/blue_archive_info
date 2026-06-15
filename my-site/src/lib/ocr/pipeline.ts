// OCR 통합 entry point.
//   Blob/path → 이미지 디코딩 → 셀 검출 → 셀별 시각 매칭 + 수량 OCR → 결과.
//
// `runOcrPipeline()` 한 번 호출로 한 장의 이미지를 끝까지 처리. 여러 장 처리 시 외부에서 반복 호출.
// 인덱스 + Tesseract worker 는 모듈 내부에서 lazy init / 한 번 생성 후 재사용.

import { detectCells, type CellBox } from './cellDetection';
import { extractIcon } from './iconExtraction';
import { loadOcrIndex } from './indexLoader';
import { matchAgainstIndex, type MatchCandidate } from './multiStageMatch';
import { extractCount } from './countOcr';

export interface PipelineCandidate {
  /** Python 호환 키 (`item:NNN` / `equipment:NNN`) — OcrImportDialog 의 findInventoryKey 와 호환 */
  key: string;
  name: string;
  /** 0~1 (matchTemplate NCC) */
  score: number;
}

export interface PipelineCell {
  bbox: [number, number, number, number];
  count: number;
  countRaw: string;
  candidates: PipelineCandidate[];
}

export interface PipelineResult {
  cells: PipelineCell[];
  totalMs: number;
  detectMs: number;
  matchMs: number;
  ocrMs: number;
  cellCount: number;
}

export interface PipelineProgress {
  stage: 'load' | 'detect' | 'cell';
  cellIdx?: number;
  cellTotal?: number;
}

interface CachedTesseract {
  worker: { recognize: (c: HTMLCanvasElement) => Promise<{ data: { text: string } }>; terminate: () => Promise<unknown> };
}

let tesseractCache: CachedTesseract | null = null;

async function getTesseractWorker(): Promise<CachedTesseract['worker']> {
  if (tesseractCache) return tesseractCache.worker;
  const Tesseract = await import('tesseract.js');
  const worker = await Tesseract.createWorker('eng');
  // PSM.SINGLE_LINE — 셀 하단 25% 가 단일 줄("x278" 같은) 임을 강제. AUTO 보다 5-10배 빠름.
  await worker.setParameters({
    tessedit_char_whitelist: 'x0123456789X',
    tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
  });
  tesseractCache = { worker: worker as unknown as CachedTesseract['worker'] };
  return tesseractCache.worker;
}

export async function disposeTesseract(): Promise<void> {
  if (!tesseractCache) return;
  await tesseractCache.worker.terminate();
  tesseractCache = null;
}

/** Blob (또는 dataURL) → HTMLImageElement */
async function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('이미지 디코딩 실패'));
      img.src = url;
    });
  } finally {
    // Image 가 메모리에 들어간 후엔 url 해제 가능
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export interface PipelineOptions {
  /** roiX 가로 비율 [start, end]. 기본 [0.5, 1] (게임 인벤토리는 우측 50%). */
  roiX?: [number, number];
  /** roiY 세로 비율 [start, end]. 기본 [0, 1]. */
  roiY?: [number, number];
}

export async function runOcrPipeline(
  blob: Blob,
  onProgress?: (p: PipelineProgress) => void,
  options?: PipelineOptions,
): Promise<PipelineResult> {
  const t0 = performance.now();
  onProgress?.({ stage: 'load' });

  const [img, index, worker] = await Promise.all([
    blobToImage(blob),
    loadOcrIndex(),
    getTesseractWorker(),
  ]);

  onProgress?.({ stage: 'detect' });
  const detectT0 = performance.now();
  const cells = await detectCells(img, {
    roiX: options?.roiX ?? [0.5, 1],
    roiY: options?.roiY ?? [0, 1],
  });
  const detectMs = performance.now() - detectT0;

  let matchMs = 0;
  let ocrMs = 0;
  const resultCells: PipelineCell[] = [];

  for (let i = 0; i < cells.length; i++) {
    onProgress?.({ stage: 'cell', cellIdx: i, cellTotal: cells.length });
    const cell: CellBox = cells[i];
    const { rgba, gray, size } = extractIcon(img, cell);

    const m0 = performance.now();
    const cands: MatchCandidate[] = await matchAgainstIndex(rgba, gray, size, index);
    matchMs += performance.now() - m0;

    const o0 = performance.now();
    const { raw, count } = await extractCount(img, cell, worker);
    ocrMs += performance.now() - o0;

    resultCells.push({
      bbox: [cell.x, cell.y, cell.w, cell.h],
      count: count ?? 0,
      countRaw: raw,
      candidates: cands.map((c) => {
        const entry = index.meta.entries[c.idx];
        return { key: entry.key, name: entry.name, score: c.score };
      }),
    });
  }

  return {
    cells: resultCells,
    totalMs: performance.now() - t0,
    detectMs,
    matchMs,
    ocrMs,
    cellCount: cells.length,
  };
}
