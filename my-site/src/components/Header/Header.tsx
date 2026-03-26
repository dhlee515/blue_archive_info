import { Link } from 'react-router';
import logo from '@/data/logo.png';

export default function Header() {
  return (
    <header className="bg-[#1070e3] text-white p-4 shadow-md sticky top-0 z-50 h-[64px] flex items-center">
      <div className="w-full px-4 flex justify-between items-center">
        <Link to="/" className="text-xl font-bold flex items-center gap-2">
          <img src={logo} alt="프라나 AI" className="h-8 w-8 object-contain" />
          프라나 AI
        </Link>
      </div>
    </header>
  );
}
