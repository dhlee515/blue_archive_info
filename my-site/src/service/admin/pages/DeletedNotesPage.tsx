import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import type { SecretNote } from '@/types/secretNote';
import { SecretNoteRepository } from '@/repositories/secretNoteRepository';
import { TypeBadge } from '@/service/secretNote/plugins/TypeBadge';

export default function DeletedNotesPage() {
  const [notes, setNotes] = useState<SecretNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const data = await SecretNoteRepository.getDeletedNotes();
        setNotes(data);
      } catch (error) {
        console.error('Failed to fetch deleted notes:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const handleRestore = async (id: string) => {
    setRestoringId(id);
    try {
      await SecretNoteRepository.restoreNote(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch (error) {
      console.error('Failed to restore note:', error);
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
      <Link to="/admin/notes" className="text-sm text-blue-600 dark:text-blue-400 hover:underline mb-4 inline-block">
        ← 비밀 노트 관리로
      </Link>

      <h1 className="text-3xl font-extrabold text-blue-900 dark:text-blue-300 mb-6 tracking-tight">삭제된 비밀 노트</h1>

      {notes.length > 0 ? (
        <div className="flex flex-col">
          {notes.map((note) => (
            <div
              key={note.id}
              className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 last:border-b-0"
            >
              <TypeBadge noteType={note.noteType} />
              <span className="font-medium text-gray-400 dark:text-slate-400 flex-1 truncate line-through">
                {note.title}
              </span>
              <span className="text-xs text-gray-400 dark:text-slate-400 font-mono truncate hidden md:inline">
                /n/{note.slug}
              </span>
              <span className="text-xs text-gray-400 dark:text-slate-400 whitespace-nowrap">
                {new Date(note.updatedAt).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </span>
              <button
                onClick={() => handleRestore(note.id)}
                disabled={restoringId === note.id}
                className="px-3 py-1 bg-green-50 dark:bg-green-900/40 hover:bg-green-100 dark:hover:bg-green-900/50 text-green-600 dark:text-green-400 text-xs font-medium rounded transition-colors disabled:opacity-50 ml-2"
              >
                {restoringId === note.id ? '복원 중' : '복원'}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-gray-400 dark:text-slate-400 border border-dashed border-gray-300 dark:border-slate-600 rounded-lg">
          삭제된 비밀 노트가 없습니다.
        </div>
      )}
    </div>
  );
}
