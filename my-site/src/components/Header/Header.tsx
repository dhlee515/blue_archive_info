import { Link } from 'react-router';
import logo from '@/data/logo.png';

interface Props {
  isMenuOpen: boolean;
  onToggleMenu: () => void;
}

export default function Header({ isMenuOpen, onToggleMenu }: Props) {
  return (
    <header className="bg-[#1070e3] text-white p-4 shadow-md dark:shadow-none dark:border-b dark:border-slate-700 sticky top-0 z-50 h-16 flex items-center">
      <div className="w-full px-4 flex justify-between items-center">
        <Link to="/" className="text-xl font-bold flex items-center gap-2">
          <img src={logo} alt="프라나 AI" className="h-8 w-8 object-contain" />
          프라나 AI
        </Link>
        <button
          onClick={onToggleMenu}
          className="md:hidden p-2 rounded-lg hover:bg-blue-500 transition-colors"
          aria-label="메뉴 토글"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {isMenuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>
    </header>
  );
}
