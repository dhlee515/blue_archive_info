import { Outlet } from 'react-router';
import Header from '../Header/Header';
import Sidebar from '../navigation/Sidebar';

export default function MainLayout() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans flex flex-col">
      <Header />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 p-6 md:p-8 overflow-x-hidden max-w-7xl mx-auto w-full">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
