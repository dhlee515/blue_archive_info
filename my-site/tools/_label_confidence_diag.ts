// 라벨 cell 별 매칭 후 cosine top-1 / margin → 자동 매칭 임계 비율 + 정답률 분석.
//
// 목적: OcrImportDialog 의 자동 매칭 임계 (cosine ≥ 0.4 + margin ≥ 0.05) 가
//   - 얼마나 자주 통과하는가
//   - 통과 시 정답률은?
//   - 통과 못 한 셀의 정답이 top-N 안에 있는가
//
// 사용:
//   npx tsx tools/_label_confidence_diag.ts data/labels/labels-*.json

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { computeColorHist, histDistance, histScore, HIST_BINS } from '../src/lib/ocr/colorHist';
import { extractEmbeddingsTTA, embeddingCosine, applyAdapter, RAW_EMBEDDING_DIM } from '../src/lib/ocr/embedding';
import { extractIconFromCellRgba } from '../src/lib/ocr/iconExtraction';
import type { OcrIndexMeta } from '../src/lib/ocr/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEX_DIR = resolve(__dirname, '../public/ocr');
const NORM = 96;
const HIST_NARROW = 500;

interface LabelExport {
  labels: Array<{
    label: string;
    labelName: string;
    cellDataUrl?: string;
  }>;
}

async function main(): Promise<void> {
  const jsonPaths = process.argv.slice(2);
  if (jsonPaths.length === 0) {
    console.error('사용: tsx tools/_label_confidence_diag.ts <json...>');
    process.exit(1);
  }

  // 인덱스 로드
  const meta = JSON.parse(readFileSync(resolve(INDEX_DIR, 'items.json'), 'utf-8')) as OcrIndexMeta;
  const histsBuf = readFileSync(resolve(INDEX_DIR, 'hist.bin'));
  const embedBuf = readFileSync(resolve(INDEX_DIR, 'embed.bin'));
  const hists = new Float32Array(histsBuf.buffer, histsBuf.byteOffset, histsBuf.byteLength / 4);
  const embeds = new Float32Array(embedBuf.buffer, embedBuf.byteOffset, embedBuf.byteLength / 4);
  const N = meta.entries.length;
  const embedDim = meta.embeddingDim;
  let adapter: Float32Array | null = null;
  if (meta.adapter?.enabled) {
    const aBuf = readFileSync(resolve(INDEX_DIR, meta.adapter.weightPath || 'adapter.bin'));
    adapter = new Float32Array(aBuf.buffer, aBuf.byteOffset, aBuf.byteLength / 4);
  }

  // 라벨 모으기
  const allLabels: LabelExport['labels'] = [];
  for (const p of jsonPaths) {
    const data = JSON.parse(readFileSync(p, 'utf-8')) as LabelExport;
    allLabels.push(...data.labels);
  }
  const useful = allLabels.filter(
    (l) => l.label && !['none', 'header', 'unknown'].includes(l.label) && l.cellDataUrl,
  );
  console.log(`라벨 ${useful.length}, 인덱스 ${N}, embedDim=${embedDim}, adapter=${!!adapter}`);

  const keyToIdx = new Map(meta.entries.map((e, i) => [e.key, i]));

  // 임계 시나리오들
  const scenarios = [
    { name: '기본 (cos≥0.40, margin≥0.05)', cosT: 0.4, marT: 0.05 },
    { name: '느슨 (cos≥0.30, margin≥0.03)', cosT: 0.3, marT: 0.03 },
    { name: '엄격 (cos≥0.50, margin≥0.10)', cosT: 0.5, marT: 0.1 },
    { name: '매우엄격 (cos≥0.60, margin≥0.15)', cosT: 0.6, marT: 0.15 },
    { name: '자동매칭 off (모두 후보 표시)', cosT: 999, marT: 999 },
  ];

  // 각 셀 별 cosine top-1 / margin / 정답 rank 측정
  const results: Array<{
    name: string;
    truthIdx: number;
    top1: { idx: number; score: number };
    top2Score: number;
    margin: number;
    truthRank: number; // 0-indexed
  }> = [];

  for (const entry of useful) {
    const truthIdx = keyToIdx.get(entry.label);
    if (truthIdx === undefined) continue;

    // cell decode → 96 RGB → embedding
    const b64 = entry.cellDataUrl!.split(',')[1];
    const buf = Buffer.from(b64, 'base64');
    const sm = await sharp(buf).metadata();
    const cw = sm.width!;
    const ch = sm.height!;
    const rgbaRaw = new Uint8Array(await sharp(buf).ensureAlpha().raw().toBuffer());
    const normalized = extractIconFromCellRgba(rgbaRaw, cw, ch);

    const cellHist = computeColorHist(normalized.rgba, NORM, NORM);
    const cellRgb = new Uint8Array(NORM * NORM * 3);
    for (let i = 0; i < NORM * NORM; i++) {
      cellRgb[i * 3] = normalized.rgba[i * 4];
      cellRgb[i * 3 + 1] = normalized.rgba[i * 4 + 1];
      cellRgb[i * 3 + 2] = normalized.rgba[i * 4 + 2];
    }
    const rawCellEmbed = (await extractEmbeddingsTTA(cellRgb, NORM))[0];
    const cellEmbed = adapter
      ? applyAdapter(rawCellEmbed, adapter, RAW_EMBEDDING_DIM, embedDim)
      : rawCellEmbed;

    // hist top-500 narrow
    const histArr: { idx: number; score: number }[] = new Array(N);
    for (let i = 0; i < N; i++) {
      const off = i * HIST_BINS;
      histArr[i] = { idx: i, score: histScore(histDistance(cellHist, hists.subarray(off, off + HIST_BINS))) };
    }
    histArr.sort((a, b) => b.score - a.score);
    const stage1Top = histArr.slice(0, HIST_NARROW);

    // embed cosine
    const embedArr = stage1Top.map((c) => {
      const off = c.idx * embedDim;
      const slot = embeds.subarray(off, off + embedDim);
      return { idx: c.idx, score: embeddingCosine(cellEmbed, slot) };
    });
    embedArr.sort((a, b) => b.score - a.score);
    const top1 = embedArr[0];
    const top2 = embedArr[1] ?? { idx: -1, score: 0 };
    const margin = top1.score - top2.score;
    const truthRank = embedArr.findIndex((c) => c.idx === truthIdx);

    results.push({
      name: entry.labelName,
      truthIdx,
      top1,
      top2Score: top2.score,
      margin,
      truthRank,
    });
  }

  // 시나리오별 통계
  console.log(`\n시나리오별 자동 매칭 / 정답 통계 (N=${results.length}):`);
  console.log(`${'시나리오'.padEnd(36)} ${'자동매칭률'.padEnd(10)} ${'자동매칭 정답률'.padEnd(15)} ${'후보표시 시 top-5'.padEnd(14)} ${'후보표시 시 정답 top-1'.padEnd(20)}`);
  for (const s of scenarios) {
    const auto = results.filter((r) => r.top1.score >= s.cosT && r.margin >= s.marT);
    const autoCorrect = auto.filter((r) => r.truthRank === 0).length;
    const manual = results.filter((r) => !(r.top1.score >= s.cosT && r.margin >= s.marT));
    const manualTop5 = manual.filter((r) => r.truthRank < 5).length;
    const manualTop1 = manual.filter((r) => r.truthRank === 0).length;
    const autoRate = (auto.length / results.length) * 100;
    const autoAcc = auto.length ? (autoCorrect / auto.length) * 100 : 0;
    const manualTop5Rate = manual.length ? (manualTop5 / manual.length) * 100 : 0;
    const manualTop1Rate = manual.length ? (manualTop1 / manual.length) * 100 : 0;
    console.log(
      `${s.name.padEnd(36)} ${auto.length.toString().padStart(2)}/${results.length} (${autoRate.toFixed(0).padStart(2)}%)  ${autoCorrect}/${auto.length || '-'} (${autoAcc.toFixed(0)}%)        ${manualTop5}/${manual.length} (${manualTop5Rate.toFixed(0)}%)      ${manualTop1}/${manual.length} (${manualTop1Rate.toFixed(0)}%)`,
    );
  }

  // 자동 매칭 실패 케이스 분석 — top-1 가 정답이지만 margin 작아서 confirm 필요한 케이스
  const goodTop1ButLowMargin = results.filter((r) => r.truthRank === 0 && r.margin < 0.05);
  console.log(`\n자동 매칭 실패 ∩ top-1 정답 (margin 부족): ${goodTop1ButLowMargin.length}`);
  for (const r of goodTop1ButLowMargin.slice(0, 10)) {
    console.log(`  "${r.name}"  cos=${r.top1.score.toFixed(3)}  margin=${r.margin.toFixed(3)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
