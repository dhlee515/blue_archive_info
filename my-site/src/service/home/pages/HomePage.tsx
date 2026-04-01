import { Link } from 'react-router';
import logo from '@/data/logo.png';

export default function HomePage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="text-center py-12">
        <h1 className="text-4xl font-extrabold text-blue-900 mb-4 tracking-tight flex items-center justify-center gap-3">
          <img src={logo} alt="프라나 AI" className="h-10 w-10 object-contain" />
          프라나 AI
        </h1>
        <p className="text-xl text-gray-500 max-w-2xl mx-auto">
          키보토스의 모든 정보를 한곳에서 확인하세요.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto w-full">
        <Link 
          to="/students" 
          className="group p-6 bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md hover:border-blue-300 transition-all text-center"
        >
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
            🎓
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2 group-hover:text-blue-600">학생 목록</h2>
          <p className="text-gray-500">
            학교, 역할, 공격 타입 등 다양한 조건으로 학생들을 검색해보세요.
          </p>
        </Link>
        
        <Link
          to="/guide"
          className="group p-6 bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md hover:border-amber-300 transition-all text-center"
        >
          <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
            🔰
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2 group-hover:text-amber-600">정보글</h2>
          <p className="text-gray-500">
            블루아카이브 공략과 정보를 확인하세요.
          </p>
        </Link>
        
        <Link 
          to="/calculator/eligma" 
          className="group p-6 bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md hover:border-purple-300 transition-all text-center"
        >
          <div className="w-16 h-16 bg-purple-50 text-purple-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
            🧮
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2 group-hover:text-purple-600">엘리그마 계산기</h2>
          <p className="text-gray-500">
            성급업/전무업에 필요한 엘리그마 소모량을 미리 계산합니다.
          </p>
        </Link>
        <Link 
          to="/calculator/crafting" 
          className="group p-6 bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md hover:border-purple-300 transition-all text-center"
        >
          <div className="w-16 h-16 bg-purple-50 text-purple-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
            🧮
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2 group-hover:text-purple-600">제조 기댓값 계산기</h2>
          <p className="text-gray-500">
            특정 아이템 제조 기댓값을 미리 계산합니다.
          </p>
        </Link>
      </div>
    </div>
  );
}
