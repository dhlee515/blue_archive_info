import { useState, useEffect } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { ChevronDown } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type NavLink = { name: string; path: string };
type NavGroup = { name: string; children: NavLink[] };
type NavItem = NavLink | NavGroup;

const navItems: NavItem[] = [
  { name: '대시보드', path: '/' },
  {
    name: '정보',
    children: [
      { name: '정보글',      path: '/guide' },
      { name: '학생 목록',   path: '/students' },
      { name: '리세계 추천', path: '/reroll' },
    ],
  },
  {
    name: '계산기',
    children: [
      { name: '엘리그마 계산기', path: '/calculator/eligma' },
      { name: '제조 계산기',    path: '/calculator/crafting' },
      { name: '이벤트 계산기',  path: '/calculator/event' },
    ],
  },
];

const STORAGE_KEY = 'sidebar.openGroups';
const DEFAULT_OPEN: string[] = ['정보', '계산기'];

function loadOpenGroups(): Set<string> {
  if (typeof window === 'undefined') return new Set(DEFAULT_OPEN);
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return new Set(parsed);
    }
  } catch {
    // ignore parse errors
  }
  return new Set(DEFAULT_OPEN);
}

export default function Sidebar({ isOpen, onClose }: Props) {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const isInternalContext = searchParams.get('internal') === 'true';
  const isInternalActive = location.pathname === '/admin/notices' || isInternalContext;
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);

  const [openGroups, setOpenGroups] = useState<Set<string>>(loadOpenGroups);

  // 펼침 상태 영속화
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...openGroups]));
    } catch {
      // ignore storage errors
    }
  }, [openGroups]);

  // 현재 경로가 그룹 하위에 있으면 해당 그룹 자동 펼침
  useEffect(() => {
    setOpenGroups((prev) => {
      let changed = false;
      const next = new Set(prev);
      navItems.forEach((item) => {
        if ('children' in item) {
          const active = item.children.some(
            (c) => location.pathname === c.path || location.pathname.startsWith(c.path + '/')
          );
          if (active && !next.has(item.name)) {
            next.add(item.name);
            changed = true;
          }
        }
      });
      return changed ? next : prev;
    });
  }, [location.pathname]);

  const toggleGroup = (name: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const isActive = (path: string): boolean => {
    if (path === '/') return location.pathname === '/';
    const matched = location.pathname === path || location.pathname.startsWith(path + '/');
    if (!matched) return false;
    if (path === '/guide' && isInternalContext) return false;
    return true;
  };

  const handleSignOut = async () => {
    await signOut();
    onClose();
  };

  const linkBase = 'px-4 py-2 rounded-md font-medium transition-colors block';
  const linkActive = 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300';
  const linkIdle = 'text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700 hover:text-gray-900 dark:hover:text-slate-100';

  const navContent = (
    <div className="p-4 flex flex-col gap-2 h-full">
      {/* 상단: 로그인/로그아웃, 마이페이지, 유저 관리 */}
      <div className="flex flex-col gap-1 pb-3 border-b border-gray-200 dark:border-slate-700 mb-1">
        {user ? (
          <>
            {user.role === 'admin' && (
              <>
                <Link
                  to="/admin/users"
                  onClick={onClose}
                  className={`px-4 py-2 rounded-md font-medium transition-colors block ${
                    location.pathname === '/admin/users'
                      ? 'bg-red-50 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                      : 'text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700 hover:text-gray-900 dark:hover:text-slate-100'
                  }`}
                >
                  유저 관리
                </Link>
                <Link
                  to="/admin/notes"
                  onClick={onClose}
                  className={`px-4 py-2 rounded-md font-medium transition-colors block ${
                    location.pathname === '/admin/notes'
                      || location.pathname.startsWith('/admin/notes/')
                      || location.pathname === '/admin/deleted-notes'
                      ? 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
                      : 'text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700 hover:text-gray-900 dark:hover:text-slate-100'
                  }`}
                >
                  비밀 노트
                </Link>
              </>
            )}
            {(user.role === 'admin' || user.role === 'editor') && (
              <Link
                to="/admin/notices"
                onClick={onClose}
                className={`px-4 py-2 rounded-md font-medium transition-colors block ${
                  isInternalActive
                    ? 'bg-yellow-50 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300'
                    : 'text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700 hover:text-gray-900 dark:hover:text-slate-100'
                }`}
              >
                내부 공지
              </Link>
            )}
            <Link
              to="/mypage"
              onClick={onClose}
              className={`px-4 py-2 rounded-md font-medium transition-colors block ${
                location.pathname === '/mypage'
                  ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                  : 'text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700 hover:text-gray-900 dark:hover:text-slate-100'
              }`}
            >
              마이페이지
            </Link>
            <button
              onClick={handleSignOut}
              className="px-4 py-2 text-left rounded-md font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/50 transition-colors"
            >
              로그아웃
            </button>
          </>
        ) : (
          <Link
            to="/login"
            onClick={onClose}
            className="px-4 py-2 rounded-md font-medium text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700 hover:text-gray-900 dark:hover:text-slate-100 transition-colors block"
          >
            로그인
          </Link>
        )}
      </div>

      {/* 하단: 메뉴 */}
      <h2 className="text-sm font-bold text-gray-400 dark:text-slate-400 uppercase mb-1 px-2">메뉴</h2>
      {navItems.map((item) => {
        if ('children' in item) {
          const isOpenGroup = openGroups.has(item.name);
          const groupActive = item.children.some((c) => isActive(c.path));
          return (
            <div key={item.name} className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => toggleGroup(item.name)}
                aria-expanded={isOpenGroup}
                className={`w-full flex items-center px-4 py-2 rounded-md font-medium transition-colors ${
                  groupActive
                    ? 'text-blue-700 dark:text-blue-300'
                    : 'text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700 hover:text-gray-900 dark:hover:text-slate-100'
                }`}
              >
                <span className="flex-1 text-left">{item.name}</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${isOpenGroup ? '' : '-rotate-90'}`} />
              </button>
              {isOpenGroup && (
                <div className="flex flex-col gap-1">
                  {item.children.map((c) => {
                    const active = isActive(c.path);
                    return (
                      <Link
                        key={c.path}
                        to={c.path}
                        onClick={onClose}
                        className={`pl-7 pr-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                          active ? linkActive : linkIdle
                        }`}
                      >
                        {c.name}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        }

        // 단일 링크
        const active = isActive(item.path);
        return (
          <Link
            key={item.path}
            to={item.path}
            onClick={onClose}
            className={`${linkBase} ${active ? linkActive : linkIdle}`}
          >
            {item.name}
          </Link>
        );
      })}
    </div>
  );

  return (
    <>
      {/* 데스크톱 사이드바 */}
      <aside className="w-64 bg-white dark:bg-slate-800 border-r border-gray-200 dark:border-slate-700 hidden md:flex flex-col h-[calc(100vh-64px)] sticky top-16">
        {navContent}
      </aside>

      {/* 모바일 오버레이 */}
      {isOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={onClose}>
          <div className="absolute inset-0 bg-black/50" />
          <aside
            className="absolute top-16 left-0 w-64 bg-white dark:bg-slate-800 h-[calc(100vh-64px)] shadow-lg flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {navContent}
          </aside>
        </div>
      )}
    </>
  );
}
