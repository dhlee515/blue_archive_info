import { useMemo, useState } from 'react';
import {
  X,
  Upload,
  Loader2,
  Check,
  AlertTriangle,
  ImageIcon,
} from 'lucide-react';
import type { InventoryMap } from '@/types/planner';
import { matchItemName, topMatches, type MatchResult } from '@/lib/ocrMatching';
import type { PipelineProgress } from '@/lib/ocr/pipeline';
import type { MaterialInfo } from '../utils/materialInfo';

interface VisualCandidate {
  key: string;       // "item:3023" / "equipment:8005" 형식
  name: string;
  distance: number;  // 0=identical, 64=max
  score: number;     // 0~1
}

interface OcrItem {
  name: string;
  count: number;
  confidence: number;
  bbox: number[];
  phash?: string | null;
  candidates?: VisualCandidate[] | null;
}

type Step = 'select' | 'processing' | 'preview' | 'error';
type MergeMode = 'overwrite' | 'add';
type MatchSource = MatchResult['method'] | 'manual' | 'visual' | 'visual+text';

interface PreviewRow {
  /** 원본 OCR 인식 결과 */
  ocr: OcrItem;
  /** 현재 매칭된 인벤토리 키 (없으면 미매칭) */
  matchedKey: string | null;
  /** 매칭 메소드/점수 (사용자 수동 선택 시 source='manual') */
  matchSource: MatchSource | null;
  matchScore: number;
  /** 사용자가 편집한 수량 */
  count: number;
  /** 적용 대상 여부 */
  include: boolean;
}

/**
 * Python 측 후보 키(`item:N` / `equipment:N`)를 인벤토리 카탈로그의 실제 키로 변환.
 *
 * 인벤토리 키 형식이 카테고리마다 다르기 때문 (단순 prefix strip 으로는 매칭 실패):
 *   - 학생 보고서: `report:N`         (Python item:N)
 *   - 무기 부품  : `wpart:N`          (Python equipment:N)
 *   - 장비 강화석: `estone:N`         (Python equipment:N)
 *   - BD/WB/오파츠/엘레프/장비조각: 그냥 `N` (Python item:N 또는 equipment:N)
 *
 * 우선순위 순서로 시도. 인벤토리에 존재하는 첫 키 반환, 없으면 null.
 */
function findInventoryKey(
  pythonKey: string,
  inventoryKeys: Set<string>,
): string | null {
  const colonIdx = pythonKey.indexOf(':');
  if (colonIdx === -1) {
    return inventoryKeys.has(pythonKey) ? pythonKey : null;
  }
  const category = pythonKey.slice(0, colonIdx);
  const id = pythonKey.slice(colonIdx + 1);

  const tryKeys =
    category === 'item'
      ? [`report:${id}`, id]
      : category === 'equipment'
        ? [`wpart:${id}`, `estone:${id}`, id]
        : [id];

  for (const k of tryKeys) {
    if (inventoryKeys.has(k)) return k;
  }
  return null;
}

interface Props {
  /** 인벤토리 키 → 표시 정보 (이름, 아이콘) 맵핑 */
  catalog: Map<string, MaterialInfo>;
  /** 현재 인벤토리 (덮어쓰기/합산 베이스) */
  currentInventory: InventoryMap;
  onClose: () => void;
  onApply: (next: InventoryMap) => void;
}

export default function OcrImportDialog({ catalog, currentInventory, onClose, onApply }: Props) {
  const [step, setStep] = useState<Step>('select');
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [mergeMode, setMergeMode] = useState<MergeMode>('add');
  const [progressMsg, setProgressMsg] = useState<string>('');

  // 매칭에 쓸 후보 리스트 (인벤토리 키 + 표시 이름)
  const candidates = useMemo(
    () =>
      Array.from(catalog.entries()).map(([key, info]) => ({
        key,
        name: info.name,
      })),
    [catalog],
  );

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const list = Array.from(e.target.files ?? []);
    if (list.length === 0) return;
    setFiles(list);
    await runOcr(list);
  };

  const runOcr = async (selectedFiles: File[]) => {
    setStep('processing');
    setError(null);
    setWarnings([]);
    setProgressMsg('');
    try {
      const validKeys = new Set(catalog.keys());
      const aggregatedItems: OcrItem[] = [];
      const warningsAcc: string[] = [];

      // pipeline 모듈(OpenCV.js + Tesseract.js)을 첫 사용 시점에만 lazy load → 메인 번들 격리.
      const { runOcrPipeline } = await import('@/lib/ocr/pipeline');

      for (let fi = 0; fi < selectedFiles.length; fi++) {
        const f = selectedFiles[fi];
        const onProgress = (p: PipelineProgress) => {
          if (p.stage === 'load') setProgressMsg(`(${fi + 1}/${selectedFiles.length}) 로드 중`);
          else if (p.stage === 'detect') setProgressMsg(`(${fi + 1}/${selectedFiles.length}) 셀 검출`);
          else if (p.stage === 'cell')
            setProgressMsg(
              `(${fi + 1}/${selectedFiles.length}) 셀 ${(p.cellIdx ?? 0) + 1}/${p.cellTotal ?? 0}`,
            );
        };
        const result = await runOcrPipeline(f, onProgress);
        if (result.cellCount === 0) {
          warningsAcc.push(`${f.name}: 셀을 검출하지 못했습니다.`);
        }
        for (const c of result.cells) {
          aggregatedItems.push({
            name: '',
            count: c.count,
            confidence: c.count > 0 ? 1 : 0,
            bbox: c.bbox,
            phash: null,
            candidates: c.candidates.map((cand) => ({
              key: cand.key,
              name: cand.name,
              distance: 0,
              score: cand.score,
            })),
          });
        }
      }

      setWarnings(warningsAcc);
      const newRows: PreviewRow[] = aggregatedItems.map((it) => {
        // 1. OCR 텍스트 매칭
        const textMatch = it.name ? matchItemName(it.name, candidates) : null;

        // 2. 시각 후보 — Python 키를 인벤토리 카탈로그 키로 변환 (카테고리별 prefix 처리)
        const visualCands = (it.candidates ?? [])
          .map((c) => {
            const invKey = findInventoryKey(c.key, validKeys);
            return invKey ? { ...c, invKey } : null;
          })
          .filter((c): c is VisualCandidate & { invKey: string } => c !== null);

        // 3. 결합 매칭
        // 시각 매칭 자동 임계: cosine 절대값보다 분리도(margin = top1-top2)가 신뢰도의 결정적 지표.
        // 55 라벨 측정: (0.3+0.03) → 자동매칭률 36% / 정답률 95% (False positive 1/20).
        //   (0.4+0.05) → 자동매칭률 25% / 정답률 100%. 적극 자동화 우선해서 전자 채택.
        //   자동 매칭 결과도 score < 0.85 면 "일치도 낮음" warning 표시 — 사용자가 검토.
        let matchedKey: string | null = null;
        let matchSource: MatchSource | null = null;
        let matchScore = 0;

        const textKey = textMatch?.candidate.key ?? null;
        const topVisual = visualCands[0] ?? null;
        const visualMargin =
          visualCands.length >= 2 ? visualCands[0].score - visualCands[1].score : (visualCands[0]?.score ?? 0);
        const visualConfident = topVisual !== null && topVisual.score >= 0.3 && visualMargin >= 0.03;

        if (textMatch && textKey && topVisual && textKey === topVisual.invKey) {
          // 텍스트 + 시각 일치 — 가장 신뢰
          matchedKey = textKey;
          matchSource = 'visual+text';
          matchScore = Math.min(1, (textMatch.score + topVisual.score) / 2 + 0.1);
        } else if (textMatch && textMatch.score >= 0.85) {
          // 텍스트만으로도 충분히 신뢰
          matchedKey = textKey;
          matchSource = textMatch.method;
          matchScore = textMatch.score;
        } else if (visualConfident) {
          // 시각 후보 — cosine ≥ 0.4 + margin ≥ 0.05 모두 통과
          matchedKey = topVisual.invKey;
          matchSource = 'visual';
          matchScore = topVisual.score;
        } else if (textMatch) {
          matchedKey = textKey;
          matchSource = textMatch.method;
          matchScore = textMatch.score;
        }

        return {
          ocr: { ...it, candidates: visualCands as unknown as VisualCandidate[] },
          matchedKey,
          matchSource,
          matchScore,
          count: it.count,
          include: matchedKey !== null && it.count > 0,
        };
      });
      setRows(newRows);
      setStep(newRows.length === 0 ? 'error' : 'preview');
      if (newRows.length === 0 && warningsAcc.length === 0) {
        setError('이미지에서 인식된 항목이 없습니다.');
      }
    } catch (e) {
      setStep('error');
      setError(`OCR 실행 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleApply = () => {
    const next: InventoryMap = mergeMode === 'overwrite' ? {} : { ...currentInventory };
    for (const row of rows) {
      if (!row.include || !row.matchedKey) continue;
      const prev = mergeMode === 'overwrite' ? 0 : (next[row.matchedKey] ?? 0);
      next[row.matchedKey] = mergeMode === 'overwrite' ? row.count : prev + row.count;
    }
    onApply(next);
  };

  const includedCount = rows.filter((r) => r.include && r.matchedKey).length;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700">
          <h2 className="text-lg font-bold text-gray-800 dark:text-slate-100">
            이미지에서 가져오기 (OCR)
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700"
            aria-label="닫기"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {step === 'select' && (
            <div className="text-center py-8 space-y-4">
              <ImageIcon size={48} className="mx-auto text-gray-400 dark:text-slate-500" />
              <p className="text-sm text-gray-600 dark:text-slate-400">
                인벤토리/창고 캡처 이미지를 선택하세요. (PNG/JPG/WEBP)
              </p>
              <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium cursor-pointer">
                <Upload size={18} /> 파일 선택
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
              <p className="text-xs text-gray-500 dark:text-slate-500 pt-4">
                첫 실행 시 OpenCV/Tesseract WASM 로드(~13MB) + 아이콘 인덱스(~12MB)를
                <br />
                불러옵니다. 두 번째부터는 즉시 시작됩니다.
              </p>
            </div>
          )}

          {step === 'processing' && (
            <div className="text-center py-12">
              <Loader2 size={40} className="mx-auto animate-spin text-blue-600 dark:text-blue-400" />
              <p className="mt-4 text-sm text-gray-600 dark:text-slate-400">
                OCR 처리 중... ({files.length}장)
              </p>
              {progressMsg && (
                <p className="mt-1 text-xs text-gray-500 dark:text-slate-500">{progressMsg}</p>
              )}
            </div>
          )}

          {step === 'error' && (
            <div className="text-center py-8 space-y-4">
              <AlertTriangle size={40} className="mx-auto text-red-500" />
              <p className="text-sm text-red-700 dark:text-red-400 whitespace-pre-line">
                {error ?? '알 수 없는 오류'}
              </p>
              <button
                onClick={() => setStep('select')}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 text-sm"
              >
                다시 시도
              </button>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              {warnings.length > 0 && (
                <div className="rounded-lg p-3 text-sm bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800 space-y-1">
                  {warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* 머지 모드 */}
              <div className="flex items-center gap-3 text-sm">
                <span className="text-gray-700 dark:text-slate-300">적용 방식:</span>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    checked={mergeMode === 'add'}
                    onChange={() => setMergeMode('add')}
                  />
                  <span>합산 (기존 + OCR)</span>
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    checked={mergeMode === 'overwrite'}
                    onChange={() => setMergeMode('overwrite')}
                  />
                  <span>덮어쓰기 (OCR만)</span>
                </label>
              </div>

              <PreviewTable
                rows={rows}
                catalog={catalog}
                candidates={candidates}
                onChange={setRows}
              />

              <div className="text-xs text-gray-500 dark:text-slate-400">
                총 {rows.length}건 인식 · 적용 예정 {includedCount}건
              </div>
            </div>
          )}
        </div>

        {step === 'preview' && (
          <div className="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-slate-700">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700"
            >
              취소
            </button>
            <button
              onClick={handleApply}
              disabled={includedCount === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium"
            >
              <Check size={16} /> 인벤토리에 적용 ({includedCount}건)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// --- 미리보기 테이블 ---

function PreviewTable({
  rows,
  catalog,
  candidates,
  onChange,
}: {
  rows: PreviewRow[];
  catalog: Map<string, MaterialInfo>;
  candidates: { key: string; name: string }[];
  onChange: (next: PreviewRow[]) => void;
}) {
  const update = (idx: number, patch: Partial<PreviewRow>) => {
    onChange(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  return (
    <div className="overflow-x-auto border border-gray-200 dark:border-slate-700 rounded-lg">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-slate-900 text-gray-600 dark:text-slate-400">
          <tr>
            <th className="text-left p-2 w-10">적용</th>
            <th className="text-left p-2">OCR 인식 텍스트</th>
            <th className="text-left p-2">매칭 결과</th>
            <th className="text-right p-2 w-28">수량</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const info = row.matchedKey ? (catalog.get(row.matchedKey) ?? null) : null;
            const lowConfidence = row.matchScore < 0.85;
            return (
              <tr
                key={i}
                className={`border-t border-gray-100 dark:border-slate-700 ${
                  !row.include ? 'opacity-50' : ''
                }`}
              >
                <td className="p-2">
                  <input
                    type="checkbox"
                    checked={row.include}
                    onChange={(e) => update(i, { include: e.target.checked })}
                  />
                </td>
                <td className="p-2">
                  <div className="text-gray-800 dark:text-slate-200">{row.ocr.name}</div>
                  <div className="text-xs text-gray-400 dark:text-slate-500">
                    OCR conf {(row.ocr.confidence * 100).toFixed(0)}%
                  </div>
                </td>
                <td className="p-2">
                  <MatchCell
                    row={row}
                    info={info}
                    catalog={catalog}
                    candidates={candidates}
                    onSelect={(key) =>
                      update(i, {
                        matchedKey: key,
                        matchSource: 'manual',
                        matchScore: 1,
                        include: true,
                      })
                    }
                  />
                  {row.matchedKey && lowConfidence && (
                    <div className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                      ⚠ 일치도 낮음 ({(row.matchScore * 100).toFixed(0)}% · {row.matchSource})
                    </div>
                  )}
                </td>
                <td className="p-2 text-right">
                  <input
                    type="number"
                    min={0}
                    value={row.count}
                    onChange={(e) =>
                      update(i, { count: Math.max(0, Number(e.target.value) || 0) })
                    }
                    className="w-24 text-right p-1 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MatchCell({
  row,
  info,
  catalog,
  candidates,
  onSelect,
}: {
  row: PreviewRow;
  info: MaterialInfo | null;
  catalog: Map<string, MaterialInfo>;
  candidates: { key: string; name: string }[];
  onSelect: (key: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');

  // Python 시각 후보 → 카탈로그 키 변환 (카테고리별 prefix 처리)
  // 현재 매칭된 키는 제외하고, 카탈로그에 존재하는 후보만 표시
  const validKeys = useMemo(() => new Set(catalog.keys()), [catalog]);
  const visualSuggestions = (row.ocr.candidates ?? [])
    .map((c) => {
      const invKey = findInventoryKey(c.key, validKeys);
      return invKey ? { invKey, name: c.name, score: c.score, info: catalog.get(invKey) } : null;
    })
    .filter(
      (c): c is { invKey: string; name: string; score: number; info: MaterialInfo | undefined } =>
        c !== null && !!c.info && c.invKey !== row.matchedKey,
    )
    .slice(0, 4);

  if (picking) {
    const suggestions =
      query.trim() === ''
        ? topMatches(row.ocr.name, candidates, 8)
        : candidates
            .filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))
            .slice(0, 8)
            .map((c) => ({ candidate: c, score: 0, method: 'jamo' as const }));

    return (
      <div className="space-y-1">
        <input
          type="text"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름 검색..."
          className="w-full p-1 text-xs border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700"
        />
        <div className="max-h-40 overflow-auto border border-gray-200 dark:border-slate-700 rounded">
          {suggestions.length === 0 ? (
            <div className="p-2 text-xs text-gray-500">검색 결과 없음</div>
          ) : (
            suggestions.map((s) => (
              <button
                key={s.candidate.key}
                onClick={() => {
                  onSelect(s.candidate.key);
                  setPicking(false);
                  setQuery('');
                }}
                className="w-full text-left p-1.5 text-xs hover:bg-gray-100 dark:hover:bg-slate-700"
              >
                {s.candidate.name}
              </button>
            ))
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setPicking(false);
            setQuery('');
          }}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          취소
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        {info ? (
          <>
            {info.iconUrl && (
              <img
                src={info.iconUrl}
                alt=""
                className="w-7 h-7 rounded object-cover shrink-0"
              />
            )}
            <span className="text-gray-800 dark:text-slate-200">{info.name}</span>
          </>
        ) : (
          <span className="text-red-600 dark:text-red-400 text-xs">미매칭</span>
        )}
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="ml-auto text-xs text-blue-600 dark:text-blue-400 hover:underline shrink-0"
        >
          변경
        </button>
      </div>

      {/* 시각 후보 — pHash top-K (현재 매칭된 항목 제외) */}
      {visualSuggestions.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
          <span className="text-[10px] text-gray-500 dark:text-slate-500 shrink-0">유사:</span>
          {visualSuggestions.map((vs) => (
            <button
              key={vs.invKey}
              onClick={() => onSelect(vs.invKey)}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:border-blue-400 dark:hover:border-blue-500 text-[11px]"
              title={`${vs.name} (시각 유사도 ${(vs.score * 100).toFixed(0)}%)`}
            >
              {vs.info?.iconUrl && (
                <img src={vs.info.iconUrl} alt="" className="w-4 h-4 rounded object-cover" />
              )}
              <span className="max-w-32 truncate">{vs.info?.name ?? vs.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
