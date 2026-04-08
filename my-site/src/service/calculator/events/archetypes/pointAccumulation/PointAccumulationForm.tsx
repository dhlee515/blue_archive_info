import { useState, useMemo } from 'react';
import type { EventConfig } from '@/types/event';
import { calcPointAccumulation } from './pointAccumulation';

interface Props {
  config: EventConfig;
}

export default function PointAccumulationForm({ config }: Props) {
  // 디스크리미네이티드 유니언 narrowing
  if (config.archetype !== 'point-accumulation') {
    return <div className="text-red-500">잘못된 이벤트 타입입니다.</div>;
  }

  const [currentPoints, setCurrentPoints] = useState(0);
  const [dailyAverage, setDailyAverage] = useState(0);
  const [targetPoints, setTargetPoints] = useState(config.targetPoints);

  const result = useMemo(
    () =>
      calcPointAccumulation({
        currentPoints,
        dailyAverage,
        targetPoints,
        endDate: config.endDate,
      }),
    [currentPoints, dailyAverage, targetPoints, config.endDate],
  );

  return (
    <div className="space-y-6">
      {/* 입력 영역 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
            현재 포인트
          </label>
          <input
            type="number"
            min={0}
            value={currentPoints}
            onChange={(e) => setCurrentPoints(Math.max(0, Number(e.target.value)))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
            일일 평균 포인트
          </label>
          <input
            type="number"
            min={0}
            value={dailyAverage}
            onChange={(e) => setDailyAverage(Math.max(0, Number(e.target.value)))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
            목표 포인트
          </label>
          <input
            type="number"
            min={0}
            value={targetPoints}
            onChange={(e) => setTargetPoints(Math.max(0, Number(e.target.value)))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* 결과 영역 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ResultCard label="부족 포인트" value={result.remainingPoints.toLocaleString()} />
        <ResultCard label="남은 일수" value={`${result.daysLeft}일`} />
        <ResultCard label="일일 필요" value={result.dailyRequired.toLocaleString()} />
        <ResultCard
          label="달성 가능"
          value={result.canAchieve ? '✅ 가능' : '❌ 불가'}
          highlight={result.canAchieve ? 'success' : 'danger'}
        />
      </div>

      {result.expectedDate && (
        <div className="text-sm text-gray-600 dark:text-slate-400">
          현재 페이스 기준 예상 도달일:{' '}
          <span className="font-semibold text-blue-600 dark:text-blue-400">
            {result.expectedDate}
          </span>
        </div>
      )}

      {/* 보상 단계 표시 */}
      {config.rewardTiers && config.rewardTiers.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-gray-700 dark:text-slate-300 mb-2">보상 단계</h3>
          <div className="space-y-1">
            {config.rewardTiers.map((tier) => {
              const reached = currentPoints >= tier.points;
              return (
                <div
                  key={tier.points}
                  className={`flex justify-between text-sm px-3 py-1.5 rounded ${
                    reached
                      ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      : 'bg-gray-50 dark:bg-slate-700 text-gray-600 dark:text-slate-400'
                  }`}
                >
                  <span>{tier.label}</span>
                  <span>{tier.points.toLocaleString()} pt</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
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
