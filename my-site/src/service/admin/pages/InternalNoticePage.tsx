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
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | 'all'>('all');
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchData() {
      try {
        const [cats, guidesData] = await Promise.all([
          CategoryRepository.getCategories(),
          GuideRepository.getGuides(selectedCategoryId === 'all' ? undefined : selectedCategoryId, true),
        ]);
        setCategories(cats);
        setGuides(guidesData);
      } catch (error) {
        console.error('Failed to fetch internal notices:', error);
      } finally {
        setLoading(false);
      }
    }
    setLoading(true);
    fetchData();
  }, [selectedCategoryId]);

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* 헤더 */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-blue-900 tracking-tight">내부 공지</h1>
          <p className="text-gray-500 mt-1 text-sm md:text-base">관리자/부관리자 전용 공지사항입니다.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isAdmin() && (
            <>
              <Link
                to="/admin/deleted-guides"
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-1.5 px-3 md:py-2 md:px-4 rounded-lg transition-colors text-xs md:text-sm"
              >
                삭제된 글
              </Link>
              <Link
                to="/admin/categories"
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-1.5 px-3 md:py-2 md:px-4 rounded-lg transition-colors text-xs md:text-sm"
              >
                카테고리 관리
              </Link>
            </>
          )}
          <Link
            to={`/guide/new?internal=true${selectedCategoryId !== 'all' ? `&category=${selectedCategoryId}` : ''}`}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-3 md:py-2 md:px-4 rounded-lg transition-colors text-xs md:text-sm"
          >
            공지 작성
          </Link>
        </div>
      </div>

      {/* 카테고리 탭 */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategoryId(cat.name === '전체' ? 'all' : cat.id)}
            className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium transition-colors whitespace-nowrap ${
              (cat.name === '전체' && selectedCategoryId === 'all') || selectedCategoryId === cat.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">데이터를 불러오는 중...</div>
      ) : guides.length > 0 ? (() => {
        const noticeCategoryId = categories.find((c) => c.name === '공지')?.id;
        const noticeGuides = noticeCategoryId
          ? guides.filter((g) => g.categoryId === noticeCategoryId)
          : [];
        const normalGuides = noticeCategoryId
          ? guides.filter((g) => g.categoryId !== noticeCategoryId)
          : guides;

        const renderRow = (guide: Guide, isNotice: boolean) => {
          const categoryName = categories.find((c) => c.id === guide.categoryId)?.name ?? '';
          const canModify = isAdmin() || guide.authorRole !== 'admin';
          return (
            <div
              key={guide.id}
              className={`px-3 md:px-4 py-2.5 md:py-3 transition-colors cursor-pointer border-b last:border-b-0 ${
                isNotice
                  ? 'bg-red-50 border-red-100 hover:bg-red-100'
                  : 'hover:bg-blue-50 border-gray-100'
              }`}
              onClick={() => navigate(`/guide/${guide.id}`)}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs px-1.5 py-0.5 bg-yellow-50 text-yellow-700 rounded font-bold whitespace-nowrap shrink-0">
                  내부
                </span>
                {isNotice ? (
                  <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded font-bold whitespace-nowrap shrink-0">
                    공지
                  </span>
                ) : categoryName ? (
                  <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded font-medium whitespace-nowrap shrink-0">
                    {categoryName}
                  </span>
                ) : null}
                <span className={`font-medium truncate text-sm md:text-base ${isNotice ? 'text-red-900' : 'text-gray-800'}`}>
                  {guide.title}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-xs font-medium ${
                  guide.authorRole === 'admin' ? 'text-blue-600' : 'text-pink-500'
                }`}>
                  {guide.authorNickname}
                </span>
                <span className={`text-xs ${isNotice ? 'text-red-400' : 'text-gray-400'}`}>
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
                  {canModify && (
                    <>
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
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        };

        return (
          <div className="flex flex-col">
            {noticeGuides.map((g) => renderRow(g, true))}
            {normalGuides.map((g) => renderRow(g, false))}
          </div>
        );
      })() : (
        <div className="text-center py-12 text-gray-400 border border-dashed border-gray-300 rounded-lg">
          내부 공지가 없습니다.
        </div>
      )}
    </div>
  );
}
