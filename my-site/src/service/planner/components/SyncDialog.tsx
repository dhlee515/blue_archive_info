import { useEffect, useState } from 'react';
import { X, Download, Upload, Trash2, Cloud, HardDrive, Loader2 } from 'lucide-react';
import {
  pullFromCloud,
  pushToCloud,
  clearLocal,
  getLocalCounts,
  getCloudCounts,
  type SyncCounts,
} from '@/lib/sync';
import { useAuthStore } from '@/stores/authStore';

interface Props {
  onClose: () => void;
}

export default function SyncDialog({ onClose }: Props) {
  const user = useAuthStore((s) => s.user);
  const [local, setLocal] = useState<SyncCounts | null>(null);
  const [cloud, setCloud] = useState<SyncCounts | null>(null);
  const [busy, setBusy] = useState<null | 'pull' | 'push' | 'clear' | 'load'>('load');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [l, c] = await Promise.all([
          getLocalCounts(),
          user ? getCloudCounts(user.id) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setLocal(l);
        setCloud(c);
      } catch (e) {
        if (cancelled) return;
        setMessage(`데이터 조회 실패: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        if (!cancelled) setBusy(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const refresh = async () => {
    try {
      const [l, c] = await Promise.all([
        getLocalCounts(),
        user ? getCloudCounts(user.id) : Promise.resolve(null),
      ]);
      setLocal(l);
      setCloud(c);
    } catch {
      // ignore — main message already set
    }
  };

  const handlePull = async () => {
    if (!user) return;
    if (
      !confirm(
        `클라우드의 학생 ${cloud?.students ?? '?'}명, 재화 ${cloud?.inventory ?? '?'}종으로 로컬을 덮어씁니다.\n계속할까요?`,
      )
    )
      return;
    setBusy('pull');
    setMessage(null);
    try {
      const r = await pullFromCloud(user.id);
      setMessage(`다운로드 완료 — 학생 ${r.students}명, 재화 ${r.inventory}종`);
      await refresh();
    } catch (e) {
      setMessage(`다운로드 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const handlePush = async () => {
    if (!user) return;
    if (
      !confirm(
        `로컬의 학생 ${local?.students ?? '?'}명, 재화 ${local?.inventory ?? '?'}종으로 클라우드를 덮어씁니다.\n계속할까요?`,
      )
    )
      return;
    setBusy('push');
    setMessage(null);
    try {
      const r = await pushToCloud(user.id);
      setMessage(`업로드 완료 — 학생 ${r.students}명, 재화 ${r.inventory}종`);
      await refresh();
    } catch (e) {
      setMessage(`업로드 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const handleClear = async () => {
    if (!confirm('로컬 데이터(학생 + 재화)를 모두 삭제합니다.\n이 작업은 되돌릴 수 없습니다. 계속할까요?'))
      return;
    setBusy('clear');
    setMessage(null);
    try {
      await clearLocal();
      setMessage('로컬 데이터를 초기화했습니다.');
      await refresh();
    } catch (e) {
      setMessage(`초기화 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const disabled = busy !== null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700">
          <h2 className="text-lg font-bold text-gray-800 dark:text-slate-100">동기화</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700"
            aria-label="닫기"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* 현황 */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-gray-200 dark:border-slate-700 p-3 bg-gray-50 dark:bg-slate-900">
              <div className="flex items-center gap-1.5 text-gray-600 dark:text-slate-400 mb-1">
                <HardDrive size={14} /> 로컬
              </div>
              <div className="text-gray-800 dark:text-slate-100">
                {local
                  ? `학생 ${local.students}명 · 재화 ${local.inventory}종`
                  : busy === 'load'
                    ? '...'
                    : '-'}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-slate-700 p-3 bg-gray-50 dark:bg-slate-900">
              <div className="flex items-center gap-1.5 text-gray-600 dark:text-slate-400 mb-1">
                <Cloud size={14} /> 클라우드
              </div>
              <div className="text-gray-800 dark:text-slate-100">
                {!user
                  ? '로그인 필요'
                  : cloud
                    ? `학생 ${cloud.students}명 · 재화 ${cloud.inventory}종`
                    : busy === 'load'
                      ? '...'
                      : '-'}
              </div>
            </div>
          </div>

          {/* 결과 메시지 */}
          {message && (
            <div className="rounded-lg p-3 text-sm bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-800">
              {message}
            </div>
          )}

          {/* 동기화 버튼 */}
          <div className="space-y-2">
            <button
              onClick={handlePull}
              disabled={disabled || !user}
              className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-200 dark:border-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {busy === 'pull' ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
              <span className="font-medium">클라우드 → 로컬 (다운로드)</span>
            </button>

            <button
              onClick={handlePush}
              disabled={disabled || !user}
              className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border border-green-300 bg-green-50 hover:bg-green-100 text-green-800 dark:bg-green-900/30 dark:hover:bg-green-900/50 dark:text-green-200 dark:border-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {busy === 'push' ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
              <span className="font-medium">로컬 → 클라우드 (업로드)</span>
            </button>

            <button
              onClick={handleClear}
              disabled={disabled}
              className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border border-red-300 bg-red-50 hover:bg-red-100 text-red-800 dark:bg-red-900/30 dark:hover:bg-red-900/50 dark:text-red-200 dark:border-red-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {busy === 'clear' ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
              <span className="font-medium">로컬 데이터 초기화</span>
            </button>
          </div>

          {!user && (
            <p className="text-xs text-gray-500 dark:text-slate-400 text-center">
              클라우드 동기화는 로그인 후 사용할 수 있습니다.
            </p>
          )}

          <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed">
            ⚠ 동기화는 자동 머지를 하지 않습니다. 어느 쪽 데이터로 덮어쓸지 직접 선택하세요.
          </p>
        </div>
      </div>
    </div>
  );
}
