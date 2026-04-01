import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import type { Guide, Category } from '@/types/guide';
import { GuideRepository } from '@/repositories/guideRepository';
import { CategoryRepository } from '@/repositories/categoryRepository';
import { useAuthStore } from '@/stores/authStore';

export default function InternalNoticePage() {
  const [guides, setGuides] = useState<Guide[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchData() {
      try {
        const [cats, guidesData] = await Promise.all([
          CategoryRepository.getCategories(),
          GuideRepository.getGuides(undefined, true),
        ]);
        setCategories(cats);
        setGuides(guidesData);
      } catch (error) {
        console.error('Failed to fetch internal notices:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-blue-900 tracking-tight">내부 공지</h1>
          <p className="text-gray-500 mt-1 text-sm md:text-base">관리자/부관리자 전용 공지사항입니다.</p>
        </div>
        <Link
          to="/guide/new?internal=true"
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-3 md:py-2 md:px-4 rounded-lg transition-colors text-xs md:text-sm"
        >
          공지 작성
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">데이터를 불러오는 중...</div>
      ) : guides.length > 0 ? (
        <div className="flex flex-col">
          {guides.map((guide) => {
            const categoryName = categories.find((c) => c.id === guide.categoryId)?.name ?? '';
            return (
              <div
                key={guide.id}
                className="px-3 md:px-4 py-2.5 md:py-3 hover:bg-blue-50 transition-colors cursor-pointer border-b border-gray-100 last:border-b-0"
                onClick={() => navigate(`/guide/${guide.id}`)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs px-1.5 py-0.5 bg-yellow-50 text-yellow-700 rounded font-bold whitespace-nowrap shrink-0">
                    내부
                  </span>
                  {categoryName && (
                    <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded font-medium whitespace-nowrap shrink-0">
                      {categoryName}
                    </span>
                  )}
                  <span className="font-medium truncate text-sm md:text-base text-gray-800">
                    {guide.title}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs font-medium ${
                    guide.authorRole === 'admin' ? 'text-blue-600' : 'text-pink-500'
                  }`}>
                    {guide.authorNickname}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(guide.createdAt).toLocaleDateString('ko-KR')}
                  </span>
                  <div className="flex-1" />
                  <div className="flex gap-1 md:gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {isAdmin() && (
                      <Link
                        to={`/admin/guide-logs/${guide.id}`}
                        className="px-1.5 md:px-2 py-0.5 md:py-1 bg-purple-50 hover:bg-purple-100 text-purple-600 text-xs font-medium rounded transition-colors"
                      >
                        로그
                      </Link>
                    )}
                    <Link
                      to={`/guide/${guide.id}/edit`}
                      className="px-1.5 md:px-2 py-0.5 md:py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-medium rounded transition-colors"
                    >
                      수정
                    </Link>
                    <button
                      onClick={async () => {
                        if (!user || !confirm('정말 삭제하시겠습니까?')) return;
                        setDeletingId(guide.id);
                        try {
                          await GuideRepository.deleteGuide(guide.id, user.id);
                          setGuides((prev) => prev.filter((g) => g.id !== guide.id));
                        } catch (error) {
                          console.error('Failed to delete:', error);
                          alert('삭제에 실패했습니다.');
                        } finally {
                          setDeletingId(null);
                        }
                      }}
                      disabled={deletingId === guide.id}
                      className="px-1.5 md:px-2 py-0.5 md:py-1 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-medium rounded transition-colors disabled:opacity-50"
                    >
                      {deletingId === guide.id ? '삭제 중' : '삭제'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 text-gray-400 border border-dashed border-gray-300 rounded-lg">
          내부 공지가 없습니다.
        </div>
      )}
    </div>
  );
}
