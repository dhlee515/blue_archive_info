import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import type { Guide, Category } from '@/types/guide';
import { GuideRepository } from '@/repositories/guideRepository';
import { CategoryRepository } from '@/repositories/categoryRepository';
import { useAuthStore } from '@/stores/authStore';

export default function GuideListPage() {
  const [guides, setGuides] = useState<Guide[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | 'all'>('all');
  const user = useAuthStore((s) => s.user);
  const canEdit = useAuthStore((s) => s.canEdit);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchData() {
      try {
        const [cats, guidesData] = await Promise.all([
          CategoryRepository.getCategories(),
          GuideRepository.getGuides(selectedCategoryId === 'all' ? undefined : selectedCategoryId),
        ]);
        setCategories(cats);
        setGuides(guidesData);
      } catch (error) {
        console.error('Failed to fetch data:', error);
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
          <h1 className="text-2xl md:text-3xl font-extrabold text-blue-900 dark:text-blue-300 tracking-tight">정보글</h1>
          <p className="text-gray-500 dark:text-slate-300 mt-1 text-sm md:text-base">블루아카이브 공략과 정보를 확인하세요.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isAdmin() && (
            <>
              <Link
                to="/admin/deleted-guides"
                className="bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300 font-medium py-1.5 px-3 md:py-2 md:px-4 rounded-lg transition-colors text-xs md:text-sm"
              >
                삭제된 글
              </Link>
              <Link
                to="/admin/categories"
                className="bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300 font-medium py-1.5 px-3 md:py-2 md:px-4 rounded-lg transition-colors text-xs md:text-sm"
              >
                카테고리 관리
              </Link>
            </>
          )}
          {canEdit() && (
            <Link
              to={`/guide/new${selectedCategoryId !== 'all' ? `?category=${selectedCategoryId}` : ''}`}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-3 md:py-2 md:px-4 rounded-lg transition-colors text-xs md:text-sm"
            >
              글 작성
            </Link>
          )}
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
                : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 dark:text-slate-400">데이터를 불러오는 중...</div>
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
          return (
            <div
              key={guide.id}
              className={`px-3 md:px-4 py-2.5 md:py-3 transition-colors cursor-pointer border-b last:border-b-0 ${
                isNotice
                  ? 'bg-red-50 dark:bg-red-900/40 border-red-100 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/50'
                  : 'hover:bg-blue-50 dark:hover:bg-blue-900/50 border-gray-100 dark:border-slate-700'
              }`}
              onClick={() => navigate(`/guide/${guide.id}`)}
            >
              {/* 1줄: 카테고리 + 제목 */}
              <div className="flex items-center gap-2">
                {isNotice ? (
                  <span className="text-xs px-1.5 py-0.5 bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 rounded font-bold whitespace-nowrap shrink-0">
                    공지
                  </span>
                ) : categoryName ? (
                  <span className="text-xs px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded font-medium whitespace-nowrap shrink-0">
                    {categoryName}
                  </span>
                ) : null}
                <span className={`font-medium truncate text-sm md:text-base ${isNotice ? 'text-red-900 dark:text-red-300' : 'text-gray-800 dark:text-slate-200'}`}>
                  {guide.title}
                </span>
              </div>
              {/* 2줄: 작성자 + 날짜 + 버튼 */}
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-xs font-medium ${
                  guide.authorRole === 'admin'
                    ? 'text-blue-600 dark:text-blue-400'
                    : guide.authorRole === 'editor'
                      ? 'text-pink-500 dark:text-pink-400'
                      : 'text-gray-400 dark:text-slate-400'
                }`}>
                  {guide.authorNickname}
                </span>
                <span className={`text-xs ${isNotice ? 'text-red-400' : 'text-gray-400 dark:text-slate-400'}`}>
                  {new Date(guide.createdAt).toLocaleDateString('ko-KR')}
                </span>
                <div className="flex-1" />
                {canEdit() && (() => {
                  const canModify = isAdmin() || guide.authorRole !== 'admin';
                  return (
                  <div className="flex gap-1 md:gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {isAdmin() && (
                      <Link
                        to={`/admin/guide-logs/${guide.id}`}
                        className="px-1.5 md:px-2 py-0.5 md:py-1 bg-purple-50 dark:bg-purple-900/40 hover:bg-purple-100 dark:hover:bg-purple-900/50 text-purple-600 dark:text-purple-400 text-xs font-medium rounded transition-colors"
                      >
                        로그
                      </Link>
                    )}
                    {canModify && (
                      <>
                        <Link
                          to={`/guide/${guide.id}/edit`}
                          className="px-1.5 md:px-2 py-0.5 md:py-1 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-600 dark:text-slate-400 text-xs font-medium rounded transition-colors"
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
                              console.error('Failed to delete guide:', error);
                              alert('삭제에 실패했습니다.');
                            } finally {
                              setDeletingId(null);
                            }
                          }}
                          disabled={deletingId === guide.id}
                          className="px-1.5 md:px-2 py-0.5 md:py-1 bg-red-50 dark:bg-red-900/40 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 text-xs font-medium rounded transition-colors disabled:opacity-50"
                        >
                          {deletingId === guide.id ? '삭제 중' : '삭제'}
                        </button>
                      </>
                    )}
                  </div>
                  );
                })()}
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
        <div className="text-center py-12 text-gray-400 dark:text-slate-400 border border-dashed border-gray-300 dark:border-slate-600 rounded-lg">
          표시할 정보글이 없습니다.
        </div>
      )}
    </div>
  );
}
