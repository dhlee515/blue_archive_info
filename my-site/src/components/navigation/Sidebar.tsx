import { Link, useLocation } from 'react-router';
import { useAuthStore } from '@/stores/authStore';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: Props) {
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);

  const navLinks = [
    { name: '대시보드', path: '/' },
    { name: '정보글', path: '/guide' },
    { name: '학생 목록', path: '/students' },
    { name: '엘리그마 계산기', path: '/calculator/eligma' },
    { name: '제조 계산기', path: '/calculator/crafting' },
  ];

  const handleSignOut = async () => {
    await signOut();
    onClose();
  };

  const navContent = (
    <div className="p-4 flex flex-col gap-2 h-full">
      <h2 className="text-sm font-bold text-gray-400 uppercase mb-2 px-2">메뉴</h2>
      {navLinks.map((link) => {
        const isActive = location.pathname === link.path || location.pathname.startsWith(link.path + '/');
        return (
          <Link
            key={link.path}
            to={link.path}
            onClick={onClose}
            className={`px-4 py-2 rounded-md font-medium transition-colors ${
              isActive && link.path !== '/'
                ? 'bg-blue-50 text-blue-700'
                : location.pathname === '/' && link.path === '/'
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            {link.name}
          </Link>
        );
      })}

      <div className="mt-auto pt-4 border-t border-gray-200">
        {user?.role === 'admin' && (
          <>
            <Link
              to="/admin/users"
              onClick={onClose}
              className={`px-4 py-2 rounded-md font-medium transition-colors block mb-1 ${
                location.pathname === '/admin/users'
                  ? 'bg-red-50 text-red-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              유저 관리
            </Link>
          </>
        )}
        {user ? (
          <div className="flex flex-col gap-2">
            <span className="px-4 text-xs text-gray-400 truncate">{user.nickname || user.email}</span>
            <button
              onClick={handleSignOut}
              className="px-4 py-2 text-left rounded-md font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              로그아웃
            </button>
          </div>
        ) : (
          <Link
            to="/login"
            onClick={onClose}
            className="px-4 py-2 rounded-md font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors block"
          >
            로그인
          </Link>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* 데스크톱 사이드바 */}
      <aside className="w-64 bg-white border-r border-gray-200 hidden md:flex flex-col h-[calc(100vh-64px)] sticky top-[64px]">
        {navContent}
      </aside>

      {/* 모바일 오버레이 */}
      {isOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={onClose}>
          <div className="absolute inset-0 bg-black/50" />
          <aside
            className="absolute top-[64px] left-0 w-64 bg-white h-[calc(100vh-64px)] shadow-lg flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {navContent}
          </aside>
        </div>
      )}
    </>
  );
}
