import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router';
import type { Category } from '@/types/guide';
import { GuideRepository } from '@/repositories/guideRepository';
import { CategoryRepository } from '@/repositories/categoryRepository';
import { InternalCategoryRepository } from '@/repositories/internalCategoryRepository';
import { useAuthStore } from '@/stores/authStore';
import RichTextEditor from '../components/RichTextEditor';
import { uploadGuideImage } from '../utils/uploadGuideImage';

export default function GuideFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isEdit = Boolean(id);
  const user = useAuthStore((s) => s.user);
  const canEdit = useAuthStore((s) => s.canEdit);

  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [content, setContent] = useState('');
  const [isInternal, setIsInternal] = useState(searchParams.get('internal') === 'true');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        let internal = searchParams.get('internal') === 'true';

        if (id) {
          const guide = await GuideRepository.getGuideById(id);
          setTitle(guide.title);
          setCategoryId(guide.categoryId);
          setContent(guide.content);
          setIsInternal(guide.isInternal);
          setImagePreview(guide.imageUrl);
          internal = guide.isInternal;
        }

        const cats = internal
          ? await InternalCategoryRepository.getCategories()
          : await CategoryRepository.getCategories();
        setCategories(cats);

        if (!id) {
          const paramCategory = searchParams.get('category');
          const matched = paramCategory ? cats.find((c) => c.id === paramCategory) : null;
          setCategoryId(matched ? matched.id : cats[0]?.id ?? '');
        }
      } catch (error) {
        console.error('Failed to fetch data:', error);
        navigate('/guide');
      } finally {
        setInitialLoading(false);
      }
    }
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setImageFile(file);

    if (file) {
      const reader = new FileReader();
      reader.onload = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim() || !categoryId) return;
    setLoading(true);

    try {
      if (!user) throw new Error('로그인이 필요합니다.');
      const formData = { title, categoryId, content, imageFile, isInternal };

      if (isEdit && id) {
        await GuideRepository.updateGuide(id, formData, user.id);
        navigate(isInternal ? '/admin/notices' : `/guide/${id}`);
      } else {
        await GuideRepository.createGuide(formData, user.id);
        navigate(isInternal ? '/admin/notices' : '/guide');
      }
    } catch (error) {
      console.error('Failed to save guide:', error);
      alert('저장에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return <div className="text-center py-12 text-gray-400 dark:text-slate-400">데이터를 불러오는 중...</div>;
  }

  const resourceLabel = isInternal ? '내부 공지' : '정보글';
  const actionLabel = isEdit ? '수정' : '작성';

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-extrabold text-blue-900 dark:text-blue-300 mb-6 tracking-tight flex items-center gap-2">
        {isInternal && (
          <span className="text-xs px-1.5 py-0.5 bg-yellow-50 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 rounded font-bold">
            내부
          </span>
        )}
        {resourceLabel} {actionLabel}
      </h1>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm dark:shadow-none border border-gray-200 dark:border-slate-700 p-4 md:p-6 flex flex-col gap-4 md:gap-5">
        <div>
          <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-2">제목</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full p-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-slate-700 dark:text-slate-100"
            placeholder={`${resourceLabel} 제목을 입력하세요`}
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-2">카테고리</label>
          {categories.length > 0 ? (
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full p-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-slate-700 dark:text-slate-100"
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-gray-400 dark:text-slate-400">카테고리가 없습니다. 관리자에게 문의하세요.</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-2">본문</label>
          <RichTextEditor content={content} onChange={setContent} onImageUpload={uploadGuideImage} />
        </div>

        <div className="flex flex-col md:flex-row gap-2 md:gap-3 pt-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || !categoryId || !title.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 dark:disabled:bg-blue-800 text-white font-bold py-2.5 md:py-3 px-5 md:px-6 rounded-lg transition-colors"
          >
            {loading ? '저장 중...' : isEdit ? '수정하기' : '작성하기'}
          </button>
          <button
            type="button"
            onClick={() => navigate(isInternal ? '/admin/notices' : '/guide')}
            className="bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300 font-medium py-2.5 md:py-3 px-5 md:px-6 rounded-lg transition-colors"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
