import type { Student } from '@/types/student';
import type { RerollStudent } from '@/types/reroll';
import RerollPortraitCard from './RerollPortraitCard';

interface Props {
  label: string;
  students: (RerollStudent & { student: Student })[];
  selectedIds: Set<number>;
  onToggle: (schaleId: number) => void;
}

export default function RerollCategoryRow({ label, students, selectedIds, onToggle }: Props) {
  if (students.length === 0) return null;

  return (
    <div className="flex flex-col md:flex-row gap-2 md:gap-4 py-3 border-b border-gray-200 dark:border-slate-700 last:border-b-0">
      {/* 카테고리 라벨 */}
      <div className="md:w-28 shrink-0 flex items-center">
        <h3 className="text-sm md:text-base font-bold text-gray-800 dark:text-slate-200 whitespace-nowrap">
          {label}
        </h3>
      </div>

      {/* 학생 카드 목록 */}
      <div className="reroll-row flex gap-2 md:gap-3 overflow-x-auto md:overflow-visible md:flex-wrap pb-2 md:pb-0 snap-x snap-mandatory md:snap-none">
        {students.map(({ schaleId, highlighted, student }) => (
          <div key={schaleId} className="snap-start shrink-0">
            <RerollPortraitCard
              student={student}
              highlighted={highlighted}
              selected={selectedIds.has(schaleId)}
              onToggle={() => onToggle(schaleId)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
