import type { WeaponRange, WeaponStarRange } from '@/types/planner';
import { getWeaponMaxLevelForStar, getWeaponMinLevelForStar } from '../utils/tables/weaponLevel';

interface Props {
  value: WeaponRange;
  /** 현재 학생의 전무 성급 — 무기 레벨 min/max 동적 결정 + 미해금 비활성화 */
  weaponStar: WeaponStarRange;
  onChange: (value: WeaponRange) => void;
}

export default function WeaponTargetInput({ value, weaponStar, onChange }: Props) {
  const currentMin = getWeaponMinLevelForStar(weaponStar.current);
  const currentMax = getWeaponMaxLevelForStar(weaponStar.current);
  const targetMin = getWeaponMinLevelForStar(weaponStar.target);
  const targetMax = getWeaponMaxLevelForStar(weaponStar.target);

  const currentLocked = currentMax === 0;
  const targetLocked = targetMax === 0;

  if (currentLocked && targetLocked) {
    return (
      <div className="text-xs text-gray-500 dark:text-slate-400 p-2 rounded border border-dashed border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-900/50">
        고유무기 미해금 — 학생 5성(=전무 1성) 도달 시 활성화됩니다.
      </div>
    );
  }

  const clampCurrent = (n: number) => Math.max(currentMin, Math.min(currentMax, n || 0));
  const clampTarget = (n: number) => Math.max(targetMin, Math.min(targetMax, n || 0));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <label className="block text-xs font-bold text-gray-600 dark:text-slate-400 mb-1">
          현재 레벨 <span className="font-normal text-gray-400">/ {currentMax || '미해금'}</span>
        </label>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={currentMin || 0}
            max={currentMax || 0}
            disabled={currentLocked}
            value={Math.max(currentMin, Math.min(currentMax, value.currentLevel))}
            onChange={(e) => {
              const currentLevel = clampCurrent(Number(e.target.value));
              onChange({ currentLevel, targetLevel: Math.max(currentLevel, value.targetLevel) });
            }}
            className="flex-1 min-w-0 accent-blue-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          />
          <input
            type="number"
            min={currentMin}
            max={currentMax}
            disabled={currentLocked}
            value={value.currentLevel === 0 ? '' : value.currentLevel}
            onChange={(e) => {
              const currentLevel = clampCurrent(Number(e.target.value));
              onChange({ currentLevel, targetLevel: Math.max(currentLevel, value.targetLevel) });
            }}
            onFocus={(e) => e.target.select()}
            className="w-16 p-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none dark:bg-slate-700 dark:text-slate-100 text-center disabled:bg-gray-100 disabled:dark:bg-slate-800 disabled:cursor-not-allowed disabled:text-gray-400"
            placeholder={currentLocked ? '—' : String(currentMin)}
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-bold text-gray-600 dark:text-slate-400 mb-1">
          목표 레벨 <span className="font-normal text-gray-400">/ {targetMax || '미해금'}</span>
        </label>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={targetMin || 0}
            max={targetMax || 0}
            disabled={targetLocked}
            value={Math.max(targetMin, Math.min(targetMax, value.targetLevel))}
            onChange={(e) => {
              const targetLevel = clampTarget(Number(e.target.value));
              onChange({ currentLevel: Math.min(value.currentLevel, targetLevel), targetLevel });
            }}
            className="flex-1 min-w-0 accent-blue-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          />
          <input
            type="number"
            min={targetMin}
            max={targetMax}
            disabled={targetLocked}
            value={value.targetLevel === 0 ? '' : value.targetLevel}
            onChange={(e) => {
              const targetLevel = clampTarget(Number(e.target.value));
              onChange({ currentLevel: Math.min(value.currentLevel, targetLevel), targetLevel });
            }}
            onFocus={(e) => e.target.select()}
            className="w-16 p-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none dark:bg-slate-700 dark:text-slate-100 text-center disabled:bg-gray-100 disabled:dark:bg-slate-800 disabled:cursor-not-allowed disabled:text-gray-400"
            placeholder={targetLocked ? '—' : String(targetMin)}
          />
        </div>
      </div>
    </div>
  );
}
