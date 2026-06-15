// 브라우저 entry. HTMLImageElement/Canvas → 다운샘플 → RGBA → gridDetection 호출 → 원본 좌표 환산.
//
// 자기상관 그리드 검출은 pure TS (gridDetection.ts) 라 OpenCV.js 불필요.

import { detectGrid, type CellBox, type DetectGridOptions } from './gridDetection';

export type { CellBox };
export type { DetectGridOptions };

const MAX_LONG_EDGE = 1600;

export async function detectCells(
  source: HTMLImageElement | HTMLCanvasElement,
  options?: DetectGridOptions,
): Promise<CellBox[]> {
  const srcW = ('naturalWidth' in source ? source.naturalWidth : source.width) || source.width;
  const srcH = ('naturalHeight' in source ? source.naturalHeight : source.height) || source.height;
  const longEdge = Math.max(srcW, srcH);
  const scale = longEdge > MAX_LONG_EDGE ? MAX_LONG_EDGE / longEdge : 1;
  const w = Math.round(srcW * scale);
  const h = Math.round(srcH * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('detectCells: canvas 2d unavailable');
  ctx.drawImage(source, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);
  const rgba = new Uint8Array(imgData.data.buffer, imgData.data.byteOffset, imgData.data.byteLength);

  const result = detectGrid(rgba, w, h, options);

  // 원본 좌표계로 역산
  const invScale = 1 / scale;
  return result.cells.map((c) => ({
    x: Math.round(c.x * invScale),
    y: Math.round(c.y * invScale),
    w: Math.round(c.w * invScale),
    h: Math.round(c.h * invScale),
  }));
}
