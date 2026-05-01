import type { LevelRange } from '@/types/planner';
import { STUDENT_MAX_LEVEL } from '../utils/tables/studentExp';

interface Props {
  value: LevelRange;
  onChange: (value: LevelRange) => void;
}

export default function LevelTargetInput({ value, onChange }: Props) {
  const clamp = (n: number) => Math.max(1, Math.min(STUDENT_MAX_LEVEL, n || 1));

  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className="block text-xs font-bold text-gray-600 dark:text-slate-400 mb-1">현재 레벨</label>
        <input
          type="number"
          min={1}
          max={STUDENT_MAX_LEVEL}
          value={value.current}
          onChange={(e) => {
            const current = clamp(Number(e.target.value));
            onChange({ current, target: Math.max(current, value.target) });
          }}
          onFocus={(e) => e.target.select()}
          className="w-full p-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none dark:bg-slate-700 dark:text-slate-100"
        />
      </div>
      <div>
        <label className="block text-xs font-bold text-gray-600 dark:text-slate-400 mb-1">목표 레벨</label>
        <input
          type="number"
          min={1}
          max={STUDENT_MAX_LEVEL}
          value={value.target}
          onChange={(e) => {
            const target = clamp(Number(e.target.value));
            onChange({ current: Math.min(value.current, target), target });
          }}
          onFocus={(e) => e.target.select()}
          className="w-full p-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none dark:bg-slate-700 dark:text-slate-100"
        />
      </div>
    </div>
  );
}
