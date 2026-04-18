import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router';
import type { SecretNote } from '@/types/secretNote';
import { SecretNoteRepository } from '@/repositories/secretNoteRepository';
import DOMPurify from 'dompurify';
import '@/styles/editor.css';

export default function SecretNoteViewPage() {
  const { slug } = useParams<{ slug: string }>();
  const [note, setNote] = useState<SecretNote | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        if (!slug) return;
        const data = await SecretNoteRepository.getNoteBySlug(slug);
        setNote(data);
      } catch (error) {
        console.error('Failed to fetch secret note:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [slug]);

  // 검색엔진 인덱싱 방지
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => {
      document.head.removeChild(meta);
    };
  }, []);

  if (loading) {
    return <div className="text-center py-12 text-gray-400 dark:text-slate-400">데이터를 불러오는 중...</div>;
  }

  if (!note) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 dark:text-slate-400 mb-4">존재하지 않거나 삭제된 페이지입니다.</p>
        <Link to="/" className="text-blue-600 dark:text-blue-400 hover:underline">홈으로 돌아가기</Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <article className="bg-white dark:bg-slate-800 rounded-xl shadow-sm dark:shadow-none border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div className="p-4 md:p-6">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-xs text-gray-400 dark:text-slate-400">
              {new Date(note.createdAt).toLocaleDateString('ko-KR')}
            </span>
            {note.updatedAt !== note.createdAt && (
              <span className="text-xs text-gray-400 dark:text-slate-400">
                (수정: {new Date(note.updatedAt).toLocaleDateString('ko-KR')})
              </span>
            )}
          </div>

          <h1 className="text-xl md:text-2xl font-extrabold text-gray-900 dark:text-slate-100 mb-4 md:mb-6">{note.title}</h1>

          <div
            className="tiptap-editor prose max-w-none text-gray-700 dark:text-slate-300"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(note.content) }}
          />
        </div>
      </article>
    </div>
  );
}
