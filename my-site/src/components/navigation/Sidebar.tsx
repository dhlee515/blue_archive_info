import { Link, useLocation, useSearchParams } from 'react-router';
import { useAuthStore } from '@/stores/authStore';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: Props) {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const isInternalContext = searchParams.get('internal') === 'true';
  const isInternalActive = location.pathname === '/admin/notices' || isInternalContext;
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);

  const navLinks = [
    { name: '대시보드', path: '/' },
    { name: '정보글', path: '/guide' },
    { name: '학생 목록', path: '/students' },
    { name: '리세계 추천', path: '/reroll' },
    { name: '엘리그마 계산기', path: '/calculator/eligma' },
    { name: '제조 계산기', path: '/calculator/crafting' },
    { name: '이벤트 계산기', path: '/calculator/event' },
  ];

  const handleSignOut = async () => {
    await signOut();
    onClose();
  };

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
      {navLinks.map((link) => {
        const pathMatches = location.pathname === link.path || location.pathname.startsWith(link.path + '/');
        const isActive = pathMatches && !(link.path === '/guide' && isInternalContext);
        return (
          <Link
            key={link.path}
            to={link.path}
            onClick={onClose}
            className={`px-4 py-2 rounded-md font-medium transition-colors ${
              isActive && link.path !== '/'
                ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                : location.pathname === '/' && link.path === '/'
                  ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                  : 'text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700 hover:text-gray-900 dark:hover:text-slate-100'
            }`}
          >
            {link.name}
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
