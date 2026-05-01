import { useMemo, useState } from 'react';
import type { SchaleDBStudent } from '@/types/schaledb';
import { studentIconUrl } from '@/lib/schaledbImage';
import { X } from 'lucide-react';

interface Props {
  studentsData: Record<string, SchaleDBStudent>;
  /** 이미 플래너에 담긴 학생 id 집합 */
  existingStudentIds: Set<number>;
  onClose: () => void;
  onAdd: (studentId: number) => void;
}

export default function AddStudentModal({ studentsData, existingStudentIds, onClose, onAdd }: Props) {
  const [search, setSearch] = useState('');

  const studentList = useMemo(() => {
    const arr = Object.values(studentsData);
    const q = search.trim().toLowerCase();
    return arr
      .filter((s) => s.IsReleased?.[2] !== false) // KR 출시 우선
      .filter((s) => !q || s.Name.toLowerCase().includes(q))
      .sort((a, b) => a.DefaultOrder - b.DefaultOrder);
  }, [studentsData, search]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700">
          <h2 className="text-lg font-bold text-gray-800 dark:text-slate-100">학생 추가</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700"
            aria-label="닫기"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 border-b border-gray-200 dark:border-slate-700">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="학생 이름으로 검색..."
            className="w-full p-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-slate-700 dark:text-slate-100"
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
            {studentList.map((s) => {
              const isAdded = existingStudentIds.has(s.Id);
              return (
                <button
                  key={s.Id}
                  disabled={isAdded}
                  onClick={() => {
                    onAdd(s.Id);
                    onClose();
                  }}
                  className={`relative flex flex-col items-center gap-1 p-2 rounded-lg border transition-colors ${
                    isAdded
                      ? 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 opacity-40 cursor-not-allowed'
                      : 'border-gray-200 dark:border-slate-700 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                  }`}
                >
                  <img
                    src={studentIconUrl(s.Id)}
                    alt={s.Name}
                    className="w-14 h-14 rounded object-cover"
                  />
                  <span className="text-xs text-gray-700 dark:text-slate-300 truncate w-full text-center">
                    {s.Name}
                  </span>
                  {isAdded && (
                    <span className="absolute top-1 right-1 text-[10px] bg-gray-600 text-white px-1 py-0.5 rounded">
                      추가됨
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {studentList.length === 0 && (
            <p className="text-center text-gray-400 dark:text-slate-500 py-8">
              검색 결과가 없습니다.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
