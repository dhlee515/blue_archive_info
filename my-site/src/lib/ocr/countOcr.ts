// 셀 하단 25% 영역에서 'x123' 형식 숫자 OCR.
// Tesseract.js worker 는 외부에서 재사용 (createWorker / terminate 가 매번 비용 큼).

import type { CellBox } from './cellDetection';

export interface TesseractLike {
  recognize(image: HTMLCanvasElement): Promise<{ data: { text: string } }>;
}

export async function extractCount(
  screenshot: HTMLImageElement | HTMLCanvasElement,
  cell: CellBox,
  worker: TesseractLike,
): Promise<{ raw: string; count: number | null }> {
  const cropH = Math.max(20, Math.floor(cell.h * 0.25));
  const canvas = document.createElement('canvas');
  canvas.width = cell.w;
  canvas.height = cropH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('countOcr: canvas 2d unavailable');
  ctx.drawImage(
    screenshot,
    cell.x,
    cell.y + cell.h - cropH,
    cell.w,
    cropH,
    0,
    0,
    cell.w,
    cropH,
  );

  const res = await worker.recognize(canvas);
  const text = res.data.text.trim();
  const match = text.match(/(\d+)/);
  return { raw: text, count: match ? Number(match[1]) : null };
}
