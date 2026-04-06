import type { Student } from '@/types/student';
import { studentIconUrl } from '@/lib/schaledbImage';

interface Props {
  student: Student;
  highlighted: boolean;
  selected: boolean;
  onToggle: () => void;
}

export default function RerollPortraitCard({ student, highlighted, selected, onToggle }: Props) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative w-20 md:w-24 flex flex-col items-center cursor-pointer group transition-transform active:scale-95 ${
        selected ? 'opacity-100' : 'opacity-70 hover:opacity-100'
      }`}
    >
      {/* 초상화 이미지 */}
      <div
        className={`w-16 h-16 md:w-20 md:h-20 rounded-md overflow-hidden border-2 transition-colors ${
          highlighted
            ? 'border-red-500'
            : selected
              ? 'border-blue-500 dark:border-blue-400'
              : 'border-gray-200 dark:border-slate-600'
        }`}
      >
        {student.imageUrl ? (
          <img
            src={studentIconUrl(student.schaleId)}
            alt={student.name}
            className="w-full h-full object-cover"
            loading="lazy"
            crossOrigin="anonymous"
          />
        ) : (
          <div className="w-full h-full bg-gray-100 dark:bg-slate-700 flex items-center justify-center">
            <span className="text-gray-400 dark:text-slate-500 text-xs">?</span>
          </div>
        )}

        {/* 선택 체크 오버레이 */}
        {selected && (
          <div className="absolute top-0.5 right-0.5 md:top-1 md:right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center shadow">
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
      </div>

      {/* 이름 */}
      <span className="mt-1 text-xs text-center text-gray-700 dark:text-slate-300 leading-tight line-clamp-2 w-full">
        {student.name}
      </span>
    </button>
  );
}
