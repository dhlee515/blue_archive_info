import type { GearRange } from '@/types/planner';

const GEAR_TIERS = [0, 1, 2] as const;
const TIER_LABEL: Record<number, string> = {
  0: '미해금',
  1: 'T1',
  2: 'T2',
};

interface Props {
  value: GearRange;
  onChange: (value: GearRange) => void;
}

export default function GearTargetInput({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className="block text-xs font-bold text-gray-600 dark:text-slate-400 mb-1">현재 티어</label>
        <select
          value={value.currentTier}
          onChange={(e) => {
            const currentTier = Number(e.target.value);
            onChange({ currentTier, targetTier: Math.max(currentTier, value.targetTier) });
          }}
          className="w-full p-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-slate-700 dark:text-slate-100"
        >
          {GEAR_TIERS.map((t) => (
            <option key={t} value={t}>{TIER_LABEL[t]}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-bold text-gray-600 dark:text-slate-400 mb-1">목표 티어</label>
        <select
          value={value.targetTier}
          onChange={(e) => {
            const targetTier = Number(e.target.value);
            onChange({ currentTier: Math.min(value.currentTier, targetTier), targetTier });
          }}
          className="w-full p-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-slate-700 dark:text-slate-100"
        >
          {GEAR_TIERS.map((t) => (
            <option key={t} value={t}>{TIER_LABEL[t]}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
