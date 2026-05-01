import type { SkillRange, SkillsRange } from '@/types/planner';
import { EX_SKILL_MAX, NORMAL_SKILL_MAX } from '../utils/tables/skillCost';

interface Props {
  value: SkillsRange;
  onChange: (value: SkillsRange) => void;
}

type TrackKey = keyof SkillsRange;

const TRACKS: { key: TrackKey; label: string; max: number }[] = [
  { key: 'ex', label: 'EX', max: EX_SKILL_MAX },
  { key: 'normal', label: '기본', max: NORMAL_SKILL_MAX },
  { key: 'passive', label: '강화', max: NORMAL_SKILL_MAX },
  { key: 'sub', label: '서브', max: NORMAL_SKILL_MAX },
];

export default function SkillTargetInput({ value, onChange }: Props) {
  const setTrack = (key: TrackKey, range: SkillRange) => {
    onChange({ ...value, [key]: range });
  };

  const setAllTargetsMax = () => {
    const next = { ...value };
    for (const { key, max } of TRACKS) {
      next[key] = { ...value[key], target: max };
    }
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={setAllTargetsMax}
          className="px-2 py-0.5 text-[11px] font-bold rounded-md border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30"
        >
          목표 Max
        </button>
      </div>
      {TRACKS.map(({ key, label, max }) => (
        <SkillTrack
          key={key}
          label={label}
          max={max}
          value={value[key]}
          onChange={(r) => setTrack(key, r)}
        />
      ))}
    </div>
  );
}

interface TrackProps {
  label: string;
  max: number;
  value: SkillRange;
  onChange: (value: SkillRange) => void;
}

function SkillTrack({ label, max, value, onChange }: TrackProps) {
  const clamp = (n: number) => Math.max(1, Math.min(max, n || 1));

  const onCurrentChange = (raw: number) => {
    const current = clamp(raw);
    onChange({ current, target: Math.max(current, value.target) });
  };
  const onTargetChange = (raw: number) => {
    const target = clamp(raw);
    onChange({ current: Math.min(value.current, target), target });
  };

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs font-bold text-gray-700 dark:text-slate-300">{label}</span>
        <span className="text-[11px] text-gray-400">/ {max}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-1">
        <div className="flex items-center gap-2">
          <span className="w-8 shrink-0 text-[11px] text-gray-500 dark:text-slate-400">현재</span>
          <input
            type="range"
            min={1}
            max={max}
            value={value.current}
            onChange={(e) => onCurrentChange(Number(e.target.value))}
            className="flex-1 min-w-0 accent-blue-400 cursor-pointer"
          />
          <input
            type="number"
            min={1}
            max={max}
            value={value.current}
            onChange={(e) => onCurrentChange(Number(e.target.value))}
            onFocus={(e) => e.target.select()}
            className="w-12 p-1 text-sm border border-gray-300 dark:border-slate-600 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none dark:bg-slate-700 dark:text-slate-100 text-center"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="w-8 shrink-0 text-[11px] text-gray-500 dark:text-slate-400">목표</span>
          <input
            type="range"
            min={1}
            max={max}
            value={value.target}
            onChange={(e) => onTargetChange(Number(e.target.value))}
            className="flex-1 min-w-0 accent-blue-600 cursor-pointer"
          />
          <input
            type="number"
            min={1}
            max={max}
            value={value.target}
            onChange={(e) => onTargetChange(Number(e.target.value))}
            onFocus={(e) => e.target.select()}
            className="w-12 p-1 text-sm border border-gray-300 dark:border-slate-600 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none dark:bg-slate-700 dark:text-slate-100 text-center"
          />
        </div>
      </div>
    </div>
  );
}
