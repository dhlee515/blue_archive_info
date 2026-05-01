import type { WeaponStarRange } from '@/types/planner';
import { WEAPON_STARS } from '../utils/tables/weaponStar';
import { getWeaponMaxLevelForStar } from '../utils/tables/weaponLevel';

interface Props {
  value: WeaponStarRange;
  onChange: (value: WeaponStarRange) => void;
}

export default function WeaponStarInput({ value, onChange }: Props) {
  const clamp = (n: number) => Math.max(1, Math.min(WEAPON_STARS.length, n));

  // 다음 성급 진입 조건 안내 (전무 1~3성에서만 의미 있음)
  const currentMax = getWeaponMaxLevelForStar(value.current);
  const nextMax = getWeaponMaxLevelForStar(value.current + 1);
  const showAdvanceHint = value.current >= 5 && value.current < 8 && currentMax > 0 && nextMax > currentMax;

  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-bold text-gray-600 dark:text-slate-400 mb-1">현재 단계</label>
          <select
            value={value.current}
            onChange={(e) => {
              const current = clamp(Number(e.target.value));
              onChange({ current, target: Math.max(current, value.target) });
            }}
            className="w-full p-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-slate-700 dark:text-slate-100"
          >
            {WEAPON_STARS.map((s) => (
              <option key={s.level} value={s.level}>{s.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-600 dark:text-slate-400 mb-1">목표 단계</label>
          <select
            value={value.target}
            onChange={(e) => {
              const target = clamp(Number(e.target.value));
              onChange({ current: Math.min(value.current, target), target });
            }}
            className="w-full p-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-slate-700 dark:text-slate-100"
          >
            {WEAPON_STARS.map((s) => (
              <option key={s.level} value={s.level}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>
      {showAdvanceHint && (
        <div className="mt-1.5 text-[11px] text-gray-500 dark:text-slate-400">
          다음 성급 진입 조건: 무기 레벨 <span className="font-bold text-gray-700 dark:text-slate-300">{currentMax}</span> 도달
        </div>
      )}
    </div>
  );
}
