import { useState, useMemo } from 'react';
import type { EventConfig } from '@/types/event';
import { calcMaterialExchange } from './materialExchange';

interface Props {
  config: EventConfig;
}

export default function MaterialExchangeForm({ config }: Props) {
  // 디스크리미네이티드 유니언 narrowing
  if (config.archetype !== 'material-exchange') {
    return <div className="text-red-500">잘못된 이벤트 타입입니다.</div>;
  }

  const [currentCurrency, setCurrentCurrency] = useState(0);
  const [counts, setCounts] = useState<number[]>(() => config.rewards.map(() => 0));

  const result = useMemo(
    () =>
      calcMaterialExchange({
        currentCurrency,
        currencyPerRun: config.currencyPerRun,
        rewards: config.rewards,
        selections: counts.map((desiredCount, index) => ({ index, desiredCount })),
      }),
    [currentCurrency, counts, config.currencyPerRun, config.rewards],
  );

  const updateCount = (idx: number, value: number) => {
    setCounts((prev) => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* 재화 입력 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
            보유 {config.currencyName}
          </label>
          <input
            type="number"
            min={0}
            value={currentCurrency}
            onChange={(e) => setCurrentCurrency(Math.max(0, Number(e.target.value)))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-end">
          <p className="text-sm text-gray-500 dark:text-slate-400">
            1회 진행 시{' '}
            <span className="font-semibold text-blue-600 dark:text-blue-400">
              {config.currencyPerRun} {config.currencyName}
            </span>{' '}
            획득
          </p>
        </div>
      </div>

      {/* 보상 선택 */}
      <div>
        <h3 className="text-sm font-bold text-gray-700 dark:text-slate-300 mb-2">교환할 보상</h3>
        <div className="space-y-2">
          {config.rewards.map((reward, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-800 dark:text-slate-200 truncate">
                  {reward.name}
                </div>
                <div className="text-xs text-gray-500 dark:text-slate-400">
                  개당 {reward.cost} {config.currencyName} · 최대 {reward.maxCount}개
                </div>
              </div>
              <input
                type="number"
                min={0}
                max={reward.maxCount}
                value={counts[idx]}
                onChange={(e) =>
                  updateCount(idx, Math.min(reward.maxCount, Math.max(0, Number(e.target.value))))
                }
                className="w-20 px-2 py-1 text-sm border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-gray-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          ))}
        </div>
      </div>

      {/* 결과 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ResultCard label="총 필요 재화" value={result.totalCost.toLocaleString()} />
        <ResultCard label="부족 재화" value={result.shortage.toLocaleString()} />
        <ResultCard label="추가 진행 횟수" value={`${result.additionalRuns}회`} />
        <ResultCard
          label="교환 가능"
          value={result.canAfford ? '✅ 가능' : '❌ 불가'}
          highlight={result.canAfford ? 'success' : 'danger'}
        />
      </div>
    </div>
  );
}

function ResultCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: 'success' | 'danger';
}) {
  const colorClass =
    highlight === 'success'
      ? 'text-green-600 dark:text-green-400'
      : highlight === 'danger'
        ? 'text-red-600 dark:text-red-400'
        : 'text-blue-600 dark:text-blue-400';
  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-3">
      <div className="text-xs text-gray-500 dark:text-slate-400 mb-1">{label}</div>
      <div className={`text-lg font-bold ${colorClass}`}>{value}</div>
    </div>
  );
}
