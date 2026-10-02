import { useMemo, useState } from 'react';
import type { SchaleDBStudent } from '@/types/schaledb';
import { studentIconUrl } from '@/lib/schaledbImage';
import { isReleasedInGlobal } from '@/lib/schaledb';
import { X } from 'lucide-react';

interface Props {
  studentsData: Record<string, SchaleDBStudent>;
  title: string;
  onClose: () => void;
  onSelect: (studentId: number) => void;
  /** 선택 불가 학생 id (예: 플래너에 이미 담긴 학생) */
  disabledIds?: Set<number>;
  /** disabledIds 학생에 붙는 배지 문구 */
  disabledLabel?: string;
  /** 현재 선택된 학생 강조 */
  selectedId?: number | null;
  /** 한섭 (Global) 미출시 학생에 "미출시" 배지 */
  showUnreleasedBadge?: boolean;
}

/** 학생 검색 + 아이콘 그리드 선택 모달. 선택 시 onSelect 후 닫힘. */
export default function StudentPickerModal({
  studentsData,
  title,
  onClose,
  onSelect,
  disabledIds,
  disabledLabel,
  selectedId = null,
  showUnreleasedBadge = false,
}: Props) {
  const [search, setSearch] = useState('');

  const studentList = useMemo(() => {
    const arr = Object.values(studentsData);
    const q = search.trim().toLowerCase();
    return arr
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
          <h2 className="text-lg font-bold text-gray-800 dark:text-slate-100">{title}</h2>
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
              const isDisabled = disabledIds?.has(s.Id) ?? false;
              const isSelected = s.Id === selectedId;
              const isUnreleased = showUnreleasedBadge && !isReleasedInGlobal(s);
              return (
                <button
                  key={s.Id}
                  disabled={isDisabled}
                  onClick={() => {
                    onSelect(s.Id);
                    onClose();
                  }}
                  className={`relative flex flex-col items-center gap-1 p-2 rounded-lg border transition-colors ${
                    isDisabled
                      ? 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 opacity-40 cursor-not-allowed'
                      : isSelected
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
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
                  {isDisabled && disabledLabel && (
                    <span className="absolute top-1 right-1 text-[10px] bg-gray-600 text-white px-1 py-0.5 rounded">
                      {disabledLabel}
                    </span>
                  )}
                  {isUnreleased && (
                    <span className="absolute top-1 left-1 text-[10px] bg-amber-500 text-white px-1 py-0.5 rounded">
                      미출시
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
