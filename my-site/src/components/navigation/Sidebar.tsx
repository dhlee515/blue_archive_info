import { Link, useLocation } from 'react-router';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: Props) {
  const location = useLocation();

  const navLinks = [
    { name: '대시보드', path: '/' },
    { name: '뉴비 가이드', path: '/guide/nub-info' },
    { name: '학생 목록', path: '/students' },
    { name: '엘리그마 계산기', path: '/calculator/eligma' },
    { name: '제조 계산기', path: '/calculator/crafting' },
  ];

  const navContent = (
    <div className="p-4 flex flex-col gap-2">
      <h2 className="text-sm font-bold text-gray-400 uppercase mb-2 px-2">메뉴</h2>
      {navLinks.map((link) => {
        const isActive = location.pathname === link.path;
        return (
          <Link
            key={link.path}
            to={link.path}
            onClick={onClose}
            className={`px-4 py-2 rounded-md font-medium transition-colors ${
              isActive
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
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
      <aside className="w-64 bg-white border-r border-gray-200 hidden md:flex flex-col h-[calc(100vh-64px)] sticky top-[64px]">
        {navContent}
      </aside>

      {/* 모바일 오버레이 */}
      {isOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={onClose}>
          <div className="absolute inset-0 bg-black/50" />
          <aside
            className="absolute top-[64px] left-0 w-64 bg-white h-[calc(100vh-64px)] shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {navContent}
          </aside>
        </div>
      )}
    </>
  );
}
