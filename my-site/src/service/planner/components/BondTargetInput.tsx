import type { BondRange } from '@/types/planner';
import { BOND_MAX_LEVEL } from '../utils/tables/bondExp';

interface Props {
  value: BondRange;
  onChange: (value: BondRange) => void;
  /** 메모리얼 로비 해금 인연랭크 (SchaleDBStudent.MemoryLobby[regionID]). 0 = 없음. */
  memoryLobbyRank?: number;
}

export default function BondTargetInput({ value, onChange, memoryLobbyRank }: Props) {
  const clamp = (n: number) => Math.max(1, Math.min(BOND_MAX_LEVEL, n || 1));

  const lobbyHint = (() => {
    if (!memoryLobbyRank || memoryLobbyRank <= 0) return null;
    if (value.current >= memoryLobbyRank) return `메모리얼 로비 해금됨 (인연 ${memoryLobbyRank})`;
    if (value.target >= memoryLobbyRank) return `목표 달성 시 메모리얼 로비 해금 (인연 ${memoryLobbyRank})`;
    return `메모리얼 로비: 인연 ${memoryLobbyRank} 에 해금`;
  })();

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-gray-600 dark:text-slate-400 mb-1">
            현재 인연 <span className="font-normal text-gray-400">/ {BOND_MAX_LEVEL}</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={1}
              max={BOND_MAX_LEVEL}
              value={value.current}
              onChange={(e) => {
                const current = clamp(Number(e.target.value));
                onChange({ current, target: Math.max(current, value.target) });
              }}
              className="flex-1 min-w-0 accent-pink-500 cursor-pointer"
            />
            <input
              type="number"
              min={1}
              max={BOND_MAX_LEVEL}
              value={value.current}
              onChange={(e) => {
                const current = clamp(Number(e.target.value));
                onChange({ current, target: Math.max(current, value.target) });
              }}
              onFocus={(e) => e.target.select()}
              className="w-16 p-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-pink-500 focus:outline-none dark:bg-slate-700 dark:text-slate-100 text-center"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-600 dark:text-slate-400 mb-1">
            목표 인연 <span className="font-normal text-gray-400">/ {BOND_MAX_LEVEL}</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={1}
              max={BOND_MAX_LEVEL}
              value={value.target}
              onChange={(e) => {
                const target = clamp(Number(e.target.value));
                onChange({ current: Math.min(value.current, target), target });
              }}
              className="flex-1 min-w-0 accent-pink-500 cursor-pointer"
            />
            <input
              type="number"
              min={1}
              max={BOND_MAX_LEVEL}
              value={value.target}
              onChange={(e) => {
                const target = clamp(Number(e.target.value));
                onChange({ current: Math.min(value.current, target), target });
              }}
              onFocus={(e) => e.target.select()}
              className="w-16 p-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-pink-500 focus:outline-none dark:bg-slate-700 dark:text-slate-100 text-center"
            />
          </div>
        </div>
      </div>
      {lobbyHint && (
        <p className="text-[11px] text-pink-700 dark:text-pink-300 mt-1.5">
          {lobbyHint}
        </p>
      )}
    </div>
  );
}
