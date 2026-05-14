import { useEffect, useState } from 'react';
import { Info, X } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { getLocalCounts, type SyncCounts } from '@/lib/sync';
import SyncDialog from '@/service/planner/components/SyncDialog';

/**
 * 로그인 직후, 로컬에 플래너/재화 데이터가 남아있다면 안내하는 비-모달 배너.
 * - 사용자가 로그인 했는데 빈 화면이 보이는 패닉을 방지하는 게 목적
 * - 자동 머지는 안 함 — 사용자가 직접 동기화 버튼으로 push/pull 결정
 * - sessionStorage 로 dismiss 기억 (앱 재시작 / 재로그인 시 다시 표시)
 */
export default function LoginDataBanner() {
  const user = useAuthStore((s) => s.user);
  const [counts, setCounts] = useState<SyncCounts | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setCounts(null);
      setDismissed(false);
      return;
    }
    if (sessionStorage.getItem(`sync.banner.dismissed.${user.id}`)) {
      setDismissed(true);
      return;
    }
    setDismissed(false);
    getLocalCounts()
      .then((c) => {
        if (!cancelled) setCounts(c);
      })
      .catch(() => {
        // 조회 실패 시 배너 표시 안 함
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user || dismissed || !counts) return null;
  if (counts.students === 0 && counts.inventory === 0) return null;

  const handleDismiss = () => {
    sessionStorage.setItem(`sync.banner.dismissed.${user.id}`, '1');
    setDismissed(true);
  };

  return (
    <>
      <div className="bg-blue-50 dark:bg-blue-900/30 border-b border-blue-200 dark:border-blue-800 px-4 py-2.5">
        <div className="max-w-7xl mx-auto flex items-center gap-3 text-sm">
          <Info size={16} className="text-blue-600 dark:text-blue-400 shrink-0" />
          <span className="flex-1 text-blue-900 dark:text-blue-100">
            로컬에 학생 <b>{counts.students}</b>명, 재화 <b>{counts.inventory}</b>종이 남아있습니다.
            <span className="text-blue-700 dark:text-blue-300 ml-1">
              동기화 메뉴에서 클라우드로 업로드할 수 있어요.
            </span>
          </span>
          <button
            onClick={() => setSyncOpen(true)}
            className="px-3 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium shrink-0"
          >
            동기화
          </button>
          <button
            onClick={handleDismiss}
            className="p-1 rounded-md text-blue-600 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-800/50 shrink-0"
            aria-label="배너 닫기"
          >
            <X size={16} />
          </button>
        </div>
      </div>
      {syncOpen && <SyncDialog onClose={() => setSyncOpen(false)} />}
    </>
  );
}
