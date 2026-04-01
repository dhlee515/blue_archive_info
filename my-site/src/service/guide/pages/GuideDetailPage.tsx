import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import type { Guide, Category } from '@/types/guide';
import { GuideRepository } from '@/repositories/guideRepository';
import { CategoryRepository } from '@/repositories/categoryRepository';
import { useAuthStore } from '@/stores/authStore';
import DOMPurify from 'dompurify';
import '@/styles/editor.css';

export default function GuideDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const canEdit = useAuthStore((s) => s.canEdit);
  const isAdmin = useAuthStore((s) => s.isAdmin);

  const [guide, setGuide] = useState<Guide | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        if (!id) return;
        const [guideData, cats] = await Promise.all([
          GuideRepository.getGuideById(id),
          CategoryRepository.getCategories(),
        ]);
        setGuide(guideData);
        setCategories(cats);
      } catch (error) {
        console.error('Failed to fetch guide:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [id]);

  const handleDelete = async () => {
    if (!guide || !confirm('정말 삭제하시겠습니까?')) return;

    setDeleting(true);
    try {
      await GuideRepository.deleteGuide(guide.id, user!.id);
      navigate('/guide');
    } catch (error) {
      console.error('Failed to delete guide:', error);
      alert('삭제에 실패했습니다.');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-400">데이터를 불러오는 중...</div>;
  }

  if (!guide) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 mb-4">정보글을 찾을 수 없습니다.</p>
        <Link to="/guide" className="text-blue-600 hover:underline">목록으로 돌아가기</Link>
      </div>
    );
  }

  const categoryName = categories.find((c) => c.id === guide.categoryId)?.name ?? '';

  return (
    <div className="max-w-3xl mx-auto">
      <Link to="/guide" className="text-sm text-blue-600 hover:underline mb-4 inline-block">
        ← 목록으로
      </Link>

      <article className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {guide.imageUrl && (
          <img src={guide.imageUrl} alt={guide.title} className="w-full max-h-80 object-cover" />
        )}

        <div className="p-6">
          <div className="flex items-center gap-2 mb-3">
            {categoryName && (
              <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full font-medium">
                {categoryName}
              </span>
            )}
            {guide.authorNickname && (
              <span className={`text-xs font-medium ${
                guide.authorRole === 'admin'
                  ? 'text-blue-600'
                  : guide.authorRole === 'editor'
                    ? 'text-pink-500'
                    : 'text-gray-500'
              }`}>
                {guide.authorNickname}
              </span>
            )}
            <span className="text-xs text-gray-400">
              {new Date(guide.createdAt).toLocaleDateString('ko-KR')}
            </span>
            {guide.updatedAt !== guide.createdAt && (
              <span className="text-xs text-gray-400">
                (수정: {new Date(guide.updatedAt).toLocaleDateString('ko-KR')})
              </span>
            )}
          </div>

          <h1 className="text-2xl font-extrabold text-gray-900 mb-6">{guide.title}</h1>

          <div
            className="tiptap-editor prose max-w-none text-gray-700"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(guide.content) }}
          />
        </div>

        {canEdit() && (isAdmin() || guide.authorRole !== 'admin') && (
          <div className="p-6 border-t border-gray-200 flex gap-3">
            <Link
              to={`/guide/${guide.id}/edit`}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors text-sm"
            >
              수정
            </Link>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-4 py-2 bg-red-50 hover:bg-red-100 disabled:bg-red-50 text-red-600 font-medium rounded-lg transition-colors text-sm"
            >
              {deleting ? '삭제 중...' : '삭제'}
            </button>
          </div>
        )}
      </article>
    </div>
  );
}
