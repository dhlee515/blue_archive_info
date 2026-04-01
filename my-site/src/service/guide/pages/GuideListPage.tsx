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
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-extrabold text-blue-900 tracking-tight">정보글</h1>
          <p className="text-gray-500 mt-2">블루아카이브 공략과 정보를 확인하세요.</p>
        </div>
        <div className="flex gap-2">
          {isAdmin() && (
            <>
              <Link
                to="/admin/deleted-guides"
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-4 rounded-lg transition-colors text-sm"
              >
                삭제된 글
              </Link>
              <Link
                to="/admin/categories"
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-4 rounded-lg transition-colors text-sm"
              >
                카테고리 관리
              </Link>
            </>
          )}
          {canEdit() && (
            <Link
              to="/guide/new"
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors text-sm"
            >
              글 작성
            </Link>
          )}
        </div>
      </div>

      {/* 카테고리 탭 */}
      <div className="flex gap-2 flex-wrap">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategoryId(cat.name === '전체' ? 'all' : cat.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
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
          return (
            <div
              key={guide.id}
              className={`flex items-center gap-3 px-4 py-3 transition-colors cursor-pointer border-b last:border-b-0 ${
                isNotice
                  ? 'bg-red-50 border-red-100 hover:bg-red-100'
                  : 'hover:bg-blue-50 border-gray-100'
              }`}
              onClick={() => navigate(`/guide/${guide.id}`)}
            >
              {isNotice ? (
                <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded font-bold whitespace-nowrap">
                  공지
                </span>
              ) : categoryName ? (
                <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded font-medium whitespace-nowrap">
                  {categoryName}
                </span>
              ) : null}
              <span className={`font-medium flex-1 truncate ${isNotice ? 'text-red-900' : 'text-gray-800'}`}>
                {guide.title}
              </span>
              <span className={`text-xs whitespace-nowrap font-medium ${
                guide.authorRole === 'admin'
                  ? 'text-blue-600'
                  : guide.authorRole === 'editor'
                    ? 'text-pink-500'
                    : 'text-gray-400'
              }`}>
                {guide.authorNickname}
              </span>
              <span className={`text-xs whitespace-nowrap ${isNotice ? 'text-red-400' : 'text-gray-400'}`}>
                {new Date(guide.createdAt).toLocaleDateString('ko-KR')}
              </span>
              {canEdit() && (() => {
                const canModify = isAdmin() || guide.authorRole !== 'admin';
                return (
                <div className="flex gap-1.5 ml-2" onClick={(e) => e.stopPropagation()}>
                  {isAdmin() && (
                    <Link
                      to={`/admin/guide-logs/${guide.id}`}
                      className="px-2 py-1 bg-purple-50 hover:bg-purple-100 text-purple-600 text-xs font-medium rounded transition-colors"
                    >
                      로그
                    </Link>
                  )}
                  {canModify && (
                    <>
                  <Link
                    to={`/guide/${guide.id}/edit`}
                    className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-medium rounded transition-colors"
                  >
                    수정
                  </Link>
                  <button
                    onClick={async () => {
                      if (!confirm('정말 삭제하시겠습니까?')) return;
                      await GuideRepository.deleteGuide(guide.id, user!.id);
                      setGuides((prev) => prev.filter((g) => g.id !== guide.id));
                    }}
                    className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-medium rounded transition-colors"
                  >
                    삭제
                  </button>
                    </>
                  )}
                </div>
                );
              })()}
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
          표시할 정보글이 없습니다.
        </div>
      )}
    </div>
  );
}
