import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import type { Guide, Category } from '@/types/guide';
import { GuideRepository } from '@/repositories/guideRepository';
import { CategoryRepository } from '@/repositories/categoryRepository';
import { useAuthStore } from '@/stores/authStore';

export default function DeletedGuidesPage() {
  const [guides, setGuides] = useState<Guide[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    async function fetchData() {
      try {
        const [guideData, catData] = await Promise.all([
          GuideRepository.getDeletedGuides(),
          CategoryRepository.getCategories(),
        ]);
        setGuides(guideData);
        setCategories(catData);
      } catch (error) {
        console.error('Failed to fetch deleted guides:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const handleRestore = async (id: string) => {
    setRestoringId(id);
    try {
      await GuideRepository.restoreGuide(id, user!.id);
      setGuides((prev) => prev.filter((g) => g.id !== id));
    } catch (error) {
      console.error('Failed to restore guide:', error);
      alert('복원에 실패했습니다.');
    } finally {
      setRestoringId(null);
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-400 dark:text-slate-400">데이터를 불러오는 중...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <Link to="/guide" className="text-sm text-blue-600 dark:text-blue-400 hover:underline mb-4 inline-block">
        ← 정보글 목록으로
      </Link>

      <h1 className="text-3xl font-extrabold text-blue-900 dark:text-blue-300 mb-6 tracking-tight">삭제된 글</h1>

      {guides.length > 0 ? (
        <div className="flex flex-col">
          {guides.map((guide) => {
            const categoryName = categories.find((c) => c.id === guide.categoryId)?.name ?? '';
            return (
              <div
                key={guide.id}
                className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 last:border-b-0"
              >
                {categoryName && (
                  <span className="text-xs px-1.5 py-0.5 bg-gray-200 dark:bg-slate-600 text-gray-500 dark:text-slate-300 rounded font-medium whitespace-nowrap">
                    {categoryName}
                  </span>
                )}
                <span className="font-medium text-gray-400 dark:text-slate-400 flex-1 truncate line-through">
                  {guide.title}
                </span>
                <span className="text-xs text-gray-400 dark:text-slate-400 whitespace-nowrap">
                  {guide.authorNickname}
                </span>
                <span className="text-xs text-gray-400 dark:text-slate-400 whitespace-nowrap">
                  {new Date(guide.updatedAt).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                <button
                  onClick={() => handleRestore(guide.id)}
                  disabled={restoringId === guide.id}
                  className="px-3 py-1 bg-green-50 dark:bg-green-900/40 hover:bg-green-100 dark:hover:bg-green-900/50 text-green-600 dark:text-green-400 text-xs font-medium rounded transition-colors disabled:opacity-50 ml-2"
                >
                  복원
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 text-gray-400 dark:text-slate-400 border border-dashed border-gray-300 dark:border-slate-600 rounded-lg">
          삭제된 글이 없습니다.
        </div>
      )}
    </div>
  );
}
