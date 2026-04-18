import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { SecretNoteRepository } from '@/repositories/secretNoteRepository';
import { useAuthStore } from '@/stores/authStore';
import RichTextEditor from '@/service/guide/components/RichTextEditor';
import { uploadGuideImage } from '@/service/guide/utils/uploadGuideImage';

export default function SecretNoteFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const user = useAuthStore((s) => s.user);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [customSlug, setCustomSlug] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(isEdit);

  useEffect(() => {
    async function fetchData() {
      if (!id) return;
      try {
        const note = await SecretNoteRepository.getNoteById(id);
        setTitle(note.title);
        setContent(note.content);
        setCustomSlug(note.slug);
      } catch (error) {
        console.error('Failed to fetch secret note:', error);
        navigate('/admin/notes');
      } finally {
        setInitialLoading(false);
      }
    }
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setLoading(true);

    try {
      if (!user) throw new Error('로그인이 필요합니다.');
      const formData = {
        title,
        content,
        customSlug: customSlug.trim() || undefined,
      };

      if (isEdit && id) {
        await SecretNoteRepository.updateNote(id, formData, user.id);
      } else {
        await SecretNoteRepository.createNote(formData, user.id);
      }
      navigate('/admin/notes');
    } catch (error) {
      console.error('Failed to save secret note:', error);
      alert('저장에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return <div className="text-center py-12 text-gray-400 dark:text-slate-400">데이터를 불러오는 중...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-extrabold text-blue-900 dark:text-blue-300 mb-6 tracking-tight">
        비밀 노트 {isEdit ? '수정' : '작성'}
      </h1>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm dark:shadow-none border border-gray-200 dark:border-slate-700 p-4 md:p-6 flex flex-col gap-4 md:gap-5">
        <div>
          <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-2">제목</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full p-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white dark:bg-slate-700 dark:text-slate-100"
            placeholder="비밀 노트 제목을 입력하세요"
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-2">
            커스텀 슬러그 <span className="text-gray-400 dark:text-slate-400 font-normal text-xs">(선택)</span>
          </label>
          <input
            type="text"
            value={customSlug}
            onChange={(e) => setCustomSlug(e.target.value)}
            className="w-full p-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white dark:bg-slate-700 dark:text-slate-100 font-mono text-sm"
            placeholder="비우면 자동 생성됩니다"
          />
          <p className="text-xs text-gray-400 dark:text-slate-400 mt-1 font-mono">
            공개 URL: /n/{customSlug || '<자동 생성>'}
          </p>
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-2">본문</label>
          <RichTextEditor content={content} onChange={setContent} onImageUpload={uploadGuideImage} />
        </div>

        <div className="flex flex-col md:flex-row gap-2 md:gap-3 pt-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || !title.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 dark:disabled:bg-indigo-800 text-white font-bold py-2.5 md:py-3 px-5 md:px-6 rounded-lg transition-colors"
          >
            {loading ? '저장 중...' : isEdit ? '수정하기' : '작성하기'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/admin/notes')}
            className="bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300 font-medium py-2.5 md:py-3 px-5 md:px-6 rounded-lg transition-colors"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
