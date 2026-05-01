import type { EquipmentTiers } from '@/types/planner';

/** 장비 카테고리 한글 라벨 */
const CATEGORY_LABEL: Record<string, string> = {
  Hat: '모자',
  Hairpin: '머리핀',
  Shoes: '신발',
  Bag: '가방',
  Charm: '부적',
  Watch: '시계',
  Gloves: '장갑',
  Badge: '배지',
  Necklace: '목걸이',
};

const MAX_TIER = 10;
const TIERS = Array.from({ length: MAX_TIER }, (_, i) => i + 1); // 1..10

interface Props {
  categories: string[]; // student.Equipment
  current: EquipmentTiers;
  target: EquipmentTiers;
  onChange: (current: EquipmentTiers, target: EquipmentTiers) => void;
}

export default function EquipmentTargetInput({ categories, current, target, onChange }: Props) {
  const setCurrent = (idx: number, val: number) => {
    const next = [...current];
    next[idx] = val;
    // 목표는 현재 이상으로 보정
    const nextTarget = [...target];
    if (nextTarget[idx] < val) nextTarget[idx] = val;
    onChange(next, nextTarget);
  };

  const setTarget = (idx: number, val: number) => {
    const next = [...target];
    next[idx] = val;
    const nextCurrent = [...current];
    if (nextCurrent[idx] > val) nextCurrent[idx] = val;
    onChange(nextCurrent, next);
  };

  const setAllTargetsMax = () => {
    const nextTarget = categories.map(() => MAX_TIER);
    onChange([...current], nextTarget);
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={setAllTargetsMax}
          className="px-2 py-0.5 text-[11px] font-bold rounded-md border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30"
        >
          목표 Max
        </button>
      </div>
      {categories.map((cat, idx) => (
        <div key={`${cat}-${idx}`} className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-xs font-bold text-gray-600 dark:text-slate-400">
            {CATEGORY_LABEL[cat] ?? cat}
          </span>
          <select
            value={current[idx] ?? 1}
            onChange={(e) => setCurrent(idx, Number(e.target.value))}
            className="flex-1 p-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-slate-700 dark:text-slate-100"
          >
            {TIERS.map((t) => (
              <option key={`c-${t}`} value={t}>T{t}</option>
            ))}
          </select>
          <span className="text-gray-400 text-xs">→</span>
          <select
            value={target[idx] ?? 1}
            onChange={(e) => setTarget(idx, Number(e.target.value))}
            className="flex-1 p-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-slate-700 dark:text-slate-100"
          >
            {TIERS.map((t) => (
              <option key={`t-${t}`} value={t}>T{t}</option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}
