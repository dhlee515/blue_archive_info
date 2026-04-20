import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router';
import type { SecretNote } from '@/types/secretNote';
import { SecretNoteRepository } from '@/repositories/secretNoteRepository';
import { getPlugin } from '@/service/secretNote/plugins/registry';

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

  const plugin = getPlugin(note.noteType);
  const data = plugin.deserialize({
    content: note.content,
    structuredData: note.structuredData,
  });
  const Viewer = plugin.Viewer;

  return <Viewer data={data} title={note.title} createdAt={note.createdAt} updatedAt={note.updatedAt} />;
}
