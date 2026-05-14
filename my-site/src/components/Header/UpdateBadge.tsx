import { useEffect, useState } from 'react';
import { Download, X, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import type { Update } from '@tauri-apps/plugin-updater';
import { checkForUpdates, applyUpdate } from '@/lib/updater';
import { isTauri } from '@/lib/runtime';

type Status = 'idle' | 'available' | 'downloading' | 'error';

/**
 * 데스크탑 앱에서만 동작하는 자동 업데이트 배지.
 * - 앱 마운트 시 한 번 백그라운드 체크
 * - 새 버전 있으면 헤더에 "v0.2.0 사용 가능" 배지 표시
 * - 클릭 → confirm 다이얼로그 → 다운로드/설치/재시작
 */
export default function UpdateBadge() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState<{ downloaded: number; total: number | null }>({
    downloaded: 0,
    total: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    (async () => {
      const u = await checkForUpdates();
      if (cancelled) return;
      if (u) {
        setUpdate(u);
        setStatus('available');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleClick = () => {
    if (status === 'available') setConfirmOpen(true);
  };

  const handleConfirm = async () => {
    if (!update) return;
    setConfirmOpen(false);
    setStatus('downloading');
    setError(null);
    try {
      await applyUpdate(update, (downloaded, total) => {
        setProgress({ downloaded, total });
      });
      // 여기 도달 시 relaunch 가 이미 실행 — 아래 라인은 실행 안 됨
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (!isTauri() || status === 'idle' || !update) return null;

  const percentage =
    progress.total && progress.total > 0
      ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
      : null;

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={status === 'downloading'}
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border transition-colors ${
          status === 'error'
            ? 'bg-red-500/30 text-white border-red-300/40'
            : status === 'downloading'
              ? 'bg-amber-500/30 text-white border-amber-300/40'
              : 'bg-green-500/30 text-white border-green-300/40 hover:bg-green-500/50 cursor-pointer'
        }`}
        title={
          status === 'error'
            ? `업데이트 오류: ${error}`
            : status === 'downloading'
              ? '업데이트 다운로드 중'
              : `v${update.version} 사용 가능 — 클릭해 업데이트`
        }
      >
        {status === 'downloading' ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            {percentage !== null ? `${percentage}%` : '다운로드 중'}
          </>
        ) : status === 'error' ? (
          <>
            <AlertCircle size={14} />
            업데이트 오류
          </>
        ) : (
          <>
            <Download size={14} />v{update.version}
          </>
        )}
      </button>

      {confirmOpen && (
        <UpdateConfirmDialog
          version={update.version}
          notes={update.body ?? null}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </>
  );
}

function UpdateConfirmDialog({
  version,
  notes,
  onConfirm,
  onCancel,
}: {
  version: string;
  notes: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700">
          <h2 className="text-lg font-bold text-gray-800 dark:text-slate-100 flex items-center gap-2">
            <CheckCircle size={20} className="text-green-600 dark:text-green-400" />
            새 버전 v{version}
          </h2>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-slate-200"
            aria-label="닫기"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-sm text-gray-700 dark:text-slate-300">
            새 버전이 출시되었습니다. 지금 업데이트할까요?
          </p>
          {notes && notes.trim().length > 0 && (
            <div className="rounded-lg bg-gray-50 dark:bg-slate-900 p-3 text-xs text-gray-600 dark:text-slate-400 max-h-40 overflow-y-auto whitespace-pre-wrap font-mono">
              {notes}
            </div>
          )}
          <p className="text-xs text-amber-600 dark:text-amber-400">
            ⚠ 업데이트 적용 후 앱이 자동으로 재시작됩니다. 진행 중인 작업이 있다면 먼저 저장하세요.
          </p>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-slate-700">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 text-sm"
          >
            나중에
          </button>
          <button
            onClick={onConfirm}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
          >
            <Download size={16} />
            업데이트 + 재시작
          </button>
        </div>
      </div>
    </div>
  );
}
