import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router';
import type { Category } from '@/types/guide';
import { GuideRepository } from '@/repositories/guideRepository';
import { CategoryRepository } from '@/repositories/categoryRepository';
import { InternalCategoryRepository } from '@/repositories/internalCategoryRepository';
import { useAuthStore } from '@/stores/authStore';
import RichTextEditor from '../components/RichTextEditor';
import { ImageRepository } from '@/repositories/imageRepository';
import { AppError } from '@/utils/AppError';

export default function GuideFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isEdit = Boolean(id);
  const user = useAuthStore((s) => s.user);

  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [content, setContent] = useState('');
  const [isInternal, setIsInternal] = useState(searchParams.get('internal') === 'true');
  // 썸네일 — existingImageUrl: 저장된 이미지 (수정 시), imageFile/imagePreview: 새로 고른 파일
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
          setExistingImageUrl(guide.imageUrl);
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
    e.target.value = ''; // 같은 파일 재선택도 onChange 가 발생하도록
    if (!file) return;

    try {
      ImageRepository.validate(file);
    } catch (error) {
      alert(error instanceof AppError ? error.message : '이미지를 사용할 수 없습니다.');
      return;
    }

    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  // 새로 고른 파일 취소 → 저장된 썸네일 (있으면) 로 복귀
  const handleImageCancel = () => {
    setImageFile(null);
    setImagePreview(null);
  };

  // 저장된 썸네일 제거 (저장 시 반영)
  const handleImageRemove = () => {
    setImageFile(null);
    setImagePreview(null);
    setRemoveImage(true);
  };

  const shownImage = imagePreview ?? (removeImage ? null : existingImageUrl);

  const handleSubmit = async () => {
    if (!title.trim() || !categoryId) return;
    setLoading(true);

    try {
      if (!user) throw new Error('로그인이 필요합니다.');
      const formData = { title, categoryId, content, imageFile, removeImage, isInternal };

      if (isEdit && id) {
        await GuideRepository.updateGuide(id, formData, user.id);
        navigate(isInternal ? '/admin/notices' : `/guide/${id}`);
      } else {
        await GuideRepository.createGuide(formData, user.id);
        navigate(isInternal ? '/admin/notices' : '/guide');
      }
    } catch (error) {
      console.error('Failed to save guide:', error);
      alert(error instanceof AppError && error.code === 'VALIDATION' ? error.message : '저장에 실패했습니다.');
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
          <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-2">
            썸네일 <span className="font-normal text-gray-400 dark:text-slate-500">(선택 · JPG/PNG/GIF/WebP, 5MB 이하)</span>
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept={ImageRepository.ACCEPT}
            onChange={handleImageChange}
            className="hidden"
          />
          {shownImage ? (
            <div className="flex flex-col gap-2">
              <img
                src={shownImage}
                alt="썸네일 미리보기"
                className="w-full max-h-60 object-cover rounded-lg border border-gray-200 dark:border-slate-700"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-sm px-3 py-1.5 rounded-md border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700"
                >
                  변경
                </button>
                {imageFile ? (
                  <button
                    type="button"
                    onClick={handleImageCancel}
                    className="text-sm px-3 py-1.5 rounded-md border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700"
                  >
                    선택 취소
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleImageRemove}
                    className="text-sm px-3 py-1.5 rounded-md border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
                  >
                    제거
                  </button>
                )}
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-28 flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-300 dark:border-slate-600 text-sm text-gray-500 dark:text-slate-400 hover:border-blue-400 hover:text-blue-600 dark:hover:border-blue-500 dark:hover:text-blue-400 transition-colors"
            >
              <span className="font-medium">썸네일 이미지 선택</span>
              {removeImage && <span className="text-xs text-red-500 dark:text-red-400">저장하면 기존 썸네일이 제거됩니다</span>}
            </button>
          )}
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-2">본문</label>
          <RichTextEditor content={content} onChange={setContent} onImageUpload={ImageRepository.upload} />
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
