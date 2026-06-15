// Phase A 라벨링 도구 — 게임 인벤토리 캡처 → ROI 선택 → grid 검출 → 셀 별 정답 라벨 입력 → JSON export.
// ROI 드래그로 인벤토리 영역만 골라 false positive 최소화.
// 진단 도구 (_label_diag.ts) 가 export 받아 정확도 측정 + stage 별 정답 잘림 진단.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Loader2, AlertTriangle, ImageIcon, Download, Search, X, Crop } from 'lucide-react';
import type { PipelineProgress, PipelineOptions } from '@/lib/ocr/pipeline';

interface VisualCandidate {
  key: string;
  name: string;
  score: number;
}

interface LabelRow {
  imageName: string;
  imageWidth: number;
  imageHeight: number;
  cell: { x: number; y: number; w: number; h: number };
  cellDataUrl: string;
  candidates: VisualCandidate[];
  label: string;
  labelName: string;
}

interface RoiRatio {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const DEFAULT_ROI: RoiRatio = { x0: 0.5, y0: 0, x1: 1, y1: 1 };

export default function LabelPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [roi, setRoi] = useState<RoiRatio>(DEFAULT_ROI);
  const [rows, setRows] = useState<LabelRow[]>([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressMsg, setProgressMsg] = useState('');
  const [allCandidates, setAllCandidates] = useState<{ key: string; name: string }[]>([]);
  const [savedInfo, setSavedInfo] = useState<string | null>(null);

  const stats = useMemo(() => {
    const labeled = rows.filter((r) => r.label !== '').length;
    const none = rows.filter((r) => r.label === 'none').length;
    const header = rows.filter((r) => r.label === 'header').length;
    const unknown = rows.filter((r) => r.label === 'unknown').length;
    const matched = rows.filter((r) => r.label && !['none', 'header', 'unknown'].includes(r.label)).length;
    return { labeled, none, header, unknown, matched, total: rows.length };
  }, [rows]);

  // 첫 이미지 미리보기
  useEffect(() => {
    if (files.length === 0) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(files[0]);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [files]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const list = Array.from(e.target.files ?? []);
    if (list.length === 0) return;
    setFiles(list);
    setRows([]);
    setSavedInfo(null);
  };

  const startDetection = async () => {
    setProcessing(true);
    setError(null);
    setProgressMsg('');
    try {
      const [{ runOcrPipeline }, { loadOcrIndex }] = await Promise.all([
        import('@/lib/ocr/pipeline'),
        import('@/lib/ocr/indexLoader'),
      ]);
      const index = await loadOcrIndex();
      setAllCandidates(index.meta.entries.map((e) => ({ key: e.key, name: e.name })));

      const opts: PipelineOptions = {
        roiX: [roi.x0, roi.x1],
        roiY: [roi.y0, roi.y1],
      };

      const newRows: LabelRow[] = [];
      for (let fi = 0; fi < files.length; fi++) {
        const f = files[fi];
        const onProgress = (p: PipelineProgress) => {
          setProgressMsg(`(${fi + 1}/${files.length}) ${p.stage}${p.cellIdx != null ? ` 셀 ${p.cellIdx + 1}/${p.cellTotal}` : ''}`);
        };
        const result = await runOcrPipeline(f, onProgress, opts);
        const imgUrl = URL.createObjectURL(f);
        const img = await new Promise<HTMLImageElement>((res, rej) => {
          const e = new Image();
          e.onload = () => res(e);
          e.onerror = () => rej(new Error('image decode'));
          e.src = imgUrl;
        });
        for (const cell of result.cells) {
          const cellCanvas = document.createElement('canvas');
          cellCanvas.width = cell.bbox[2];
          cellCanvas.height = cell.bbox[3];
          const ctx = cellCanvas.getContext('2d')!;
          ctx.drawImage(img, cell.bbox[0], cell.bbox[1], cell.bbox[2], cell.bbox[3], 0, 0, cell.bbox[2], cell.bbox[3]);
          newRows.push({
            imageName: f.name,
            imageWidth: img.naturalWidth,
            imageHeight: img.naturalHeight,
            cell: { x: cell.bbox[0], y: cell.bbox[1], w: cell.bbox[2], h: cell.bbox[3] },
            cellDataUrl: cellCanvas.toDataURL('image/png'),
            candidates: cell.candidates.map((c) => ({ key: c.key, name: c.name, score: c.score })),
            label: '',
            labelName: '',
          });
        }
        URL.revokeObjectURL(imgUrl);
      }
      setRows(newRows);
    } catch (e) {
      setError(`라벨링 준비 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setProcessing(false);
      setProgressMsg('');
    }
  };

  const setLabel = (idx: number, label: string, labelName = '') => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, label, labelName } : r)));
  };

  const exportLabels = async () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      roi,
      labels: rows.map((r) => ({
        imageName: r.imageName,
        imageWidth: r.imageWidth,
        imageHeight: r.imageHeight,
        cell: r.cell,
        label: r.label,
        labelName: r.labelName,
        cellDataUrl: r.cellDataUrl,
      })),
    };
    const filename = `labels-${Date.now()}.json`;
    try {
      const res = await fetch('/api/save-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, content: payload }),
      });
      if (res.ok) {
        const data = (await res.json()) as { relative: string };
        setSavedInfo(`자동 저장: ${data.relative}`);
        return;
      }
    } catch {
      // fallback
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setSavedInfo(`다운로드 (~/Downloads/${filename})`);
  };

  const showRoiStep = files.length > 0 && rows.length === 0 && !processing;

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800 dark:text-slate-100">OCR 라벨링 도구 (Phase A 진단용)</h1>
        <div className="flex items-center gap-2">
          {rows.length > 0 && (
            <span className="text-sm text-gray-600 dark:text-slate-400">
              {stats.labeled}/{stats.total} 라벨 (정답 {stats.matched} · none {stats.none} · 셀 아님 {stats.header} · 모름 {stats.unknown})
            </span>
          )}
          <button
            onClick={exportLabels}
            disabled={stats.labeled === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm font-medium"
          >
            <Download size={14} /> JSON 저장
          </button>
        </div>
      </header>

      {savedInfo && (
        <div className="rounded-lg p-3 text-sm bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800">
          ✓ {savedInfo}
        </div>
      )}

      {/* 1. 파일 업로드 */}
      {files.length === 0 && (
        <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700">
          <ImageIcon size={48} className="mx-auto text-gray-400 dark:text-slate-500" />
          <p className="mt-3 text-sm text-gray-600 dark:text-slate-400">
            게임 인벤토리 캡처를 업로드하세요. (여러 장 가능, 모두 동일한 ROI 가 적용됨)
          </p>
          <label className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white cursor-pointer">
            <Upload size={16} /> 파일 선택
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
        </div>
      )}

      {/* 2. ROI 선택 */}
      {showRoiStep && previewUrl && (
        <div className="space-y-3">
          <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-200">
            <strong>인벤토리 영역 선택</strong>: 마우스로 드래그해서 인벤토리 그리드 영역만 box 로 지정. ROI 밖은 셀 검출에서 제외됩니다.
            {files.length > 1 && ` (${files.length}장 모두에 같은 ROI 적용)`}
          </div>
          <RoiSelector imageUrl={previewUrl} roi={roi} onRoiChange={setRoi} />
          <div className="flex items-center gap-2">
            <button
              onClick={() => setRoi(DEFAULT_ROI)}
              className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-slate-600 text-sm hover:bg-gray-50 dark:hover:bg-slate-700"
            >
              기본값 (우측 50%)
            </button>
            <button
              onClick={() => setRoi({ x0: 0, y0: 0, x1: 1, y1: 1 })}
              className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-slate-600 text-sm hover:bg-gray-50 dark:hover:bg-slate-700"
            >
              전체
            </button>
            <span className="text-xs text-gray-500 dark:text-slate-400">
              ROI: x ({roi.x0.toFixed(2)} ~ {roi.x1.toFixed(2)}), y ({roi.y0.toFixed(2)} ~ {roi.y1.toFixed(2)})
            </span>
            <button
              onClick={() => {
                setFiles([]);
                setRoi(DEFAULT_ROI);
              }}
              className="ml-auto px-3 py-1.5 rounded-lg border border-gray-300 dark:border-slate-600 text-sm text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700"
            >
              파일 다시 선택
            </button>
            <button
              onClick={startDetection}
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium inline-flex items-center gap-1.5"
            >
              <Crop size={14} /> 셀 검출 시작
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg p-3 text-sm bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {processing && (
        <div className="text-center py-8">
          <Loader2 size={32} className="mx-auto animate-spin text-blue-600 dark:text-blue-400" />
          <p className="mt-3 text-sm text-gray-600 dark:text-slate-400">{progressMsg || 'OCR 처리 중...'}</p>
        </div>
      )}

      {/* 3. 라벨링 */}
      {rows.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setRows([]);
                setSavedInfo(null);
              }}
              className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-slate-600 text-sm text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700"
            >
              ROI 다시 선택
            </button>
            <span className="text-xs text-gray-500 dark:text-slate-400">
              각 셀에 정답 라벨을 클릭으로 부여. UI/메뉴/사이드바 영역에 잘못 잡힌 셀은 <strong>셀 아님</strong>.
            </span>
          </div>
          {rows.map((row, i) => (
            <LabelCard key={i} row={row} candidates={allCandidates} onSetLabel={(l, n) => setLabel(i, l, n)} />
          ))}
        </div>
      )}
    </div>
  );
}

function RoiSelector({
  imageUrl,
  roi,
  onRoiChange,
}: {
  imageUrl: string;
  roi: RoiRatio;
  onRoiChange: (next: RoiRatio) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{ x: number; y: number } | null>(null);
  const [imgDim, setImgDim] = useState<{ w: number; h: number } | null>(null);

  const onMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setDragging({ x, y });
    onRoiChange({ x0: x, y0: y, x1: x, y1: y });
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    onRoiChange({
      x0: Math.min(dragging.x, x),
      y0: Math.min(dragging.y, y),
      x1: Math.max(dragging.x, x),
      y1: Math.max(dragging.y, y),
    });
  };
  const onMouseUp = () => setDragging(null);

  const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const im = e.currentTarget;
    setImgDim({ w: im.naturalWidth, h: im.naturalHeight });
  };

  const left = `${(roi.x0 * 100).toFixed(2)}%`;
  const top = `${(roi.y0 * 100).toFixed(2)}%`;
  const width = `${((roi.x1 - roi.x0) * 100).toFixed(2)}%`;
  const height = `${((roi.y1 - roi.y0) * 100).toFixed(2)}%`;

  return (
    <div
      ref={containerRef}
      className="relative select-none cursor-crosshair max-h-[60vh] overflow-hidden rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-100 dark:bg-slate-900 inline-block"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      <img
        src={imageUrl}
        onLoad={onImgLoad}
        alt="preview"
        className="block max-h-[60vh] max-w-full pointer-events-none"
        draggable={false}
      />
      {imgDim && (
        <div
          className="absolute border-2 border-blue-500 bg-blue-500/15 pointer-events-none"
          style={{ left, top, width, height }}
        />
      )}
    </div>
  );
}

function LabelCard({
  row,
  candidates,
  onSetLabel,
}: {
  row: LabelRow;
  candidates: { key: string; name: string }[];
  onSetLabel: (label: string, labelName?: string) => void;
}) {
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!searching || query.trim() === '') return [];
    const q = query.trim();
    return candidates.filter((c) => c.name.includes(q)).slice(0, 12);
  }, [searching, query, candidates]);

  const labelBadge =
    row.label === ''
      ? null
      : row.label === 'none'
        ? <span className="px-2 py-0.5 rounded text-xs bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-200">인덱스에 없음</span>
        : row.label === 'header'
          ? <span className="px-2 py-0.5 rounded text-xs bg-amber-200 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200">셀 아님</span>
          : row.label === 'unknown'
            ? <span className="px-2 py-0.5 rounded text-xs bg-purple-200 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200">모름</span>
            : <span className="px-2 py-0.5 rounded text-xs bg-green-200 dark:bg-green-900/40 text-green-800 dark:text-green-200">정답: {row.labelName}</span>;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-3">
      <div className="flex items-center gap-3">
        <img src={row.cellDataUrl} alt="" className="w-20 h-20 rounded object-contain bg-gray-100 dark:bg-slate-900 shrink-0" />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="text-xs text-gray-500 dark:text-slate-400">
            {row.imageName} — bbox ({row.cell.x},{row.cell.y}) {row.cell.w}×{row.cell.h}  {labelBadge}
          </div>

          <div className="flex items-center gap-1 flex-wrap">
            {row.candidates.slice(0, 5).map((c) => {
              const isPicked = row.label === c.key;
              return (
                <button
                  key={c.key}
                  onClick={() => onSetLabel(c.key, c.name)}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs border ${
                    isPicked
                      ? 'border-green-500 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      : 'border-gray-300 dark:border-slate-600 hover:border-blue-400'
                  }`}
                  title={`cosine ${c.score.toFixed(3)}`}
                >
                  {c.name} <span className="text-gray-400">{c.score.toFixed(2)}</span>
                </button>
              );
            })}
            <button
              onClick={() => setSearching((s) => !s)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs border border-gray-300 dark:border-slate-600 hover:border-blue-400 text-gray-700 dark:text-slate-200"
            >
              <Search size={12} /> 검색
            </button>
            <button
              onClick={() => onSetLabel('none')}
              className={`px-2 py-1 rounded text-xs border ${row.label === 'none' ? 'border-gray-500 bg-gray-100 dark:bg-slate-700' : 'border-gray-300 dark:border-slate-600 hover:border-gray-500'}`}
              title="게임에는 있지만 인덱스(SchaleDB)에 없는 아이콘"
            >
              인덱스 없음
            </button>
            <button
              onClick={() => onSetLabel('header')}
              className={`px-2 py-1 rounded text-xs border ${row.label === 'header' ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/30' : 'border-gray-300 dark:border-slate-600 hover:border-amber-500'}`}
              title="grid 가 셀이 아닌 영역 (헤더/UI/사이드바/빈 공간) 에 잘못 잡힘"
            >
              셀 아님
            </button>
            <button
              onClick={() => onSetLabel('unknown')}
              className={`px-2 py-1 rounded text-xs border ${row.label === 'unknown' ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30' : 'border-gray-300 dark:border-slate-600 hover:border-purple-500'}`}
            >
              모름
            </button>
            {row.label && (
              <button
                onClick={() => onSetLabel('')}
                className="px-2 py-1 rounded text-xs border border-gray-300 dark:border-slate-600 hover:border-red-500 text-red-600 dark:text-red-400 inline-flex items-center gap-1"
              >
                <X size={12} /> 취소
              </button>
            )}
          </div>

          {searching && (
            <div className="space-y-1">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="이름 검색 (예: 와라쿠, 진저, 보고서)"
                autoFocus
                className="w-full p-1.5 text-xs border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700"
              />
              {filtered.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap max-h-40 overflow-y-auto">
                  {filtered.map((c) => (
                    <button
                      key={c.key}
                      onClick={() => {
                        onSetLabel(c.key, c.name);
                        setSearching(false);
                        setQuery('');
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs border border-blue-300 dark:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
