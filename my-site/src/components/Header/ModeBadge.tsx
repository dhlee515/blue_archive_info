import { Cloud, HardDrive } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { isTauri } from '@/lib/runtime';

interface Props {
  onClick?: () => void;
}

/**
 * 데스크탑 앱(Tauri) 환경에서만 표시되는 데이터 소스 배지.
 * - 로그인 상태: 클라우드 (Supabase)
 * - 비로그인: 로컬 (파일시스템 JSON)
 *
 * 클릭하면 동기화 다이얼로그를 띄울 수 있습니다 (`onClick`).
 */
export default function ModeBadge({ onClick }: Props) {
  const user = useAuthStore((s) => s.user);

  if (!isTauri()) return null;

  const isCloud = !!user;
  const baseClasses = `inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${
    isCloud
      ? 'bg-blue-500/30 text-white border border-blue-300/40'
      : 'bg-slate-500/30 text-white border border-slate-300/40'
  }`;
  const Icon = isCloud ? Cloud : HardDrive;
  const label = isCloud ? '클라우드' : '로컬';
  const title = isCloud
    ? '클라우드 모드 (Supabase 와 동기화)'
    : '로컬 모드 (이 기기에만 저장)';

  if (!onClick) {
    return (
      <span className={baseClasses} title={title}>
        <Icon size={14} />
        {label}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className={`${baseClasses} hover:bg-opacity-50 cursor-pointer transition-colors`}
      title={`${title} — 클릭해 동기화 메뉴 열기`}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}
