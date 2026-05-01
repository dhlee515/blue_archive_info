import type { WeaponRange } from '@/types/planner';
import { WEAPON_MAX_LEVEL } from '../utils/tables/weaponLevel';

interface Props {
  value: WeaponRange;
  onChange: (value: WeaponRange) => void;
}

export default function WeaponTargetInput({ value, onChange }: Props) {
  const clamp = (n: number) => Math.max(0, Math.min(WEAPON_MAX_LEVEL, n || 0));

  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className="block text-xs font-bold text-gray-600 dark:text-slate-400 mb-1">현재 레벨</label>
        <input
          type="number"
          min={0}
          max={WEAPON_MAX_LEVEL}
          value={value.currentLevel === 0 ? '' : value.currentLevel}
          onChange={(e) => {
            const currentLevel = clamp(Number(e.target.value));
            onChange({ currentLevel, targetLevel: Math.max(currentLevel, value.targetLevel) });
          }}
          onFocus={(e) => e.target.select()}
          className="w-full p-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none dark:bg-slate-700 dark:text-slate-100"
          placeholder="0 (미해금)"
        />
      </div>
      <div>
        <label className="block text-xs font-bold text-gray-600 dark:text-slate-400 mb-1">목표 레벨</label>
        <input
          type="number"
          min={0}
          max={WEAPON_MAX_LEVEL}
          value={value.targetLevel === 0 ? '' : value.targetLevel}
          onChange={(e) => {
            const targetLevel = clamp(Number(e.target.value));
            onChange({ currentLevel: Math.min(value.currentLevel, targetLevel), targetLevel });
          }}
          onFocus={(e) => e.target.select()}
          className="w-full p-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none dark:bg-slate-700 dark:text-slate-100"
          placeholder="0"
        />
      </div>
    </div>
  );
}
