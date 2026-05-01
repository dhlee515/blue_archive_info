import type { PotentialRange, PotentialsRange } from '@/types/planner';
import {
  POTENTIAL_MAX,
  POTENTIAL_STAT_LABEL,
  type PotentialStatKey,
} from '../utils/tables/potentialLevel';

interface Props {
  value: PotentialsRange;
  onChange: (value: PotentialsRange) => void;
}

const STATS: PotentialStatKey[] = ['hp', 'attack', 'crit'];

export default function PotentialTargetInput({ value, onChange }: Props) {
  const setStat = (key: PotentialStatKey, range: PotentialRange) => {
    onChange({ ...value, [key]: range });
  };

  const setAllTargetsMax = () => {
    const next = { ...value };
    for (const k of STATS) {
      next[k] = { ...value[k], target: POTENTIAL_MAX };
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
      {STATS.map((key) => (
        <PotentialTrack
          key={key}
          label={POTENTIAL_STAT_LABEL[key]}
          value={value[key]}
          onChange={(r) => setStat(key, r)}
        />
      ))}
    </div>
  );
}

interface TrackProps {
  label: string;
  value: PotentialRange;
  onChange: (value: PotentialRange) => void;
}

function PotentialTrack({ label, value, onChange }: TrackProps) {
  const clamp = (n: number) => Math.max(0, Math.min(POTENTIAL_MAX, Number.isFinite(n) ? n : 0));

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
        <span className="text-[11px] text-gray-400">/ {POTENTIAL_MAX}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-1">
        <div className="flex items-center gap-2">
          <span className="w-8 shrink-0 text-[11px] text-gray-500 dark:text-slate-400">현재</span>
          <input
            type="range"
            min={0}
            max={POTENTIAL_MAX}
            value={value.current}
            onChange={(e) => onCurrentChange(Number(e.target.value))}
            className="flex-1 min-w-0 accent-blue-400 cursor-pointer"
          />
          <input
            type="number"
            min={0}
            max={POTENTIAL_MAX}
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
            min={0}
            max={POTENTIAL_MAX}
            value={value.target}
            onChange={(e) => onTargetChange(Number(e.target.value))}
            className="flex-1 min-w-0 accent-blue-600 cursor-pointer"
          />
          <input
            type="number"
            min={0}
            max={POTENTIAL_MAX}
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
