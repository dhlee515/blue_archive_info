import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import type { SecretNote } from '@/types/secretNote';
import { SecretNoteRepository } from '@/repositories/secretNoteRepository';

export default function SecretNoteManagePage() {
  const [notes, setNotes] = useState<SecretNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const data = await SecretNoteRepository.getNotes();
        setNotes(data);
      } catch (error) {
        console.error('Failed to fetch secret notes:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const handleCopyLink = async (note: SecretNote) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/n/${note.slug}`);
      setCopiedId(note.id);
      setTimeout(() => setCopiedId((prev) => (prev === note.id ? null : prev)), 1500);
    } catch (error) {
      console.error('Failed to copy link:', error);
      alert('링크 복사에 실패했습니다.');
    }
  };

  const handleRegenerateSlug = async (id: string) => {
    if (!confirm('기존 URL이 비활성화됩니다. 재발급하시겠습니까?')) return;
    setRegeneratingId(id);
    try {
      const newSlug = await SecretNoteRepository.regenerateSlug(id);
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, slug: newSlug } : n)));
    } catch (error) {
      console.error('Failed to regenerate slug:', error);
      alert('슬러그 재발급에 실패했습니다.');
    } finally {
      setRegeneratingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    setDeletingId(id);
    try {
      await SecretNoteRepository.deleteNote(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch (error) {
      console.error('Failed to delete note:', error);
      alert('삭제에 실패했습니다.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-4 md:gap-6">
      {/* 헤더 */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-blue-900 dark:text-blue-300 tracking-tight">비밀 노트</h1>
          <p className="text-gray-500 dark:text-slate-300 mt-1 text-sm md:text-base">URL을 아는 사람만 접속할 수 있는 관리자 전용 게시판입니다.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link
            to="/admin/deleted-notes"
            className="bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300 font-medium py-1.5 px-3 md:py-2 md:px-4 rounded-lg transition-colors text-xs md:text-sm"
          >
            삭제된 노트
          </Link>
          <Link
            to="/admin/notes/new"
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-1.5 px-3 md:py-2 md:px-4 rounded-lg transition-colors text-xs md:text-sm"
          >
            새 노트 작성
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 dark:text-slate-400">데이터를 불러오는 중...</div>
      ) : notes.length > 0 ? (
        <div className="flex flex-col">
          {notes.map((note) => (
            <div
              key={note.id}
              className="px-3 md:px-4 py-2.5 md:py-3 border-b last:border-b-0 border-gray-100 dark:border-slate-700 hover:bg-indigo-50/30 dark:hover:bg-indigo-900/20"
            >
              {/* 1줄: 제목 + 슬러그 */}
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium text-gray-800 dark:text-slate-200 truncate text-sm md:text-base">
                  {note.title}
                </span>
                <span className="text-xs text-gray-400 dark:text-slate-400 font-mono truncate">
                  /n/{note.slug}
                </span>
              </div>
              {/* 2줄: 수정일 + 액션 버튼 */}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="text-xs text-gray-400 dark:text-slate-400">
                  {new Date(note.updatedAt).toLocaleDateString('ko-KR')}
                </span>
                <div className="flex-1" />
                <div className="flex gap-1 md:gap-1.5 flex-wrap">
                  <button
                    onClick={() => handleCopyLink(note)}
                    className={`px-1.5 md:px-2 py-0.5 md:py-1 text-xs font-medium rounded transition-colors ${
                      copiedId === note.id
                        ? 'bg-green-50 dark:bg-green-900/40 text-green-600 dark:text-green-400'
                        : 'bg-indigo-50 dark:bg-indigo-900/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400'
                    }`}
                  >
                    {copiedId === note.id ? '복사됨!' : '링크 복사'}
                  </button>
                  <button
                    onClick={() => handleRegenerateSlug(note.id)}
                    disabled={regeneratingId === note.id}
                    className="px-1.5 md:px-2 py-0.5 md:py-1 bg-yellow-50 dark:bg-yellow-900/40 hover:bg-yellow-100 dark:hover:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300 text-xs font-medium rounded transition-colors disabled:opacity-50"
                  >
                    {regeneratingId === note.id ? '재발급 중' : '슬러그 재발급'}
                  </button>
                  <Link
                    to={`/admin/notes/${note.id}/edit`}
                    className="px-1.5 md:px-2 py-0.5 md:py-1 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-600 dark:text-slate-400 text-xs font-medium rounded transition-colors"
                  >
                    수정
                  </Link>
                  <button
                    onClick={() => handleDelete(note.id)}
                    disabled={deletingId === note.id}
                    className="px-1.5 md:px-2 py-0.5 md:py-1 bg-red-50 dark:bg-red-900/40 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 text-xs font-medium rounded transition-colors disabled:opacity-50"
                  >
                    {deletingId === note.id ? '삭제 중' : '삭제'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-gray-400 dark:text-slate-400 border border-dashed border-gray-300 dark:border-slate-600 rounded-lg">
          표시할 비밀 노트가 없습니다.
        </div>
      )}
    </div>
  );
}
