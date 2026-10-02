import { useMemo, useState } from 'react';
import {
  STUDENT_REPORTS,
  aggregateStudentExp,
  breakdownStudentExp,
} from '@/service/planner/utils/expConversion';
import { calculateLevelCost } from '@/service/planner/utils/cultivationCalculator/levelCost';
import { STUDENT_MAX_LEVEL } from '@/service/planner/utils/tables/studentExp';
import { maxLevelFromExp } from '../utils/reportCalc';
import { itemIconUrl } from '@/lib/schaledbImage';
import NumberInput from '@/components/form/NumberInput';

function formatNumber(n: number): string {
  return n.toLocaleString('ko-KR');
}

export default function ReportCalcPage() {
  const [currentLevel, setCurrentLevel] = useState(1);
  const [targetLevel, setTargetLevel] = useState(STUDENT_MAX_LEVEL);
  const [studentCount, setStudentCount] = useState(1);
  const [counts, setCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(STUDENT_REPORTS.map((it) => [it.key, 0])),
  );

  // 큰 등급부터 표시 (SSR → N)
  const reportsDesc = useMemo(
    () => [...STUDENT_REPORTS].sort((a, b) => b.exp - a.exp),
    [],
  );

  const result = useMemo(() => {
    const current = currentLevel;
    const target = targetLevel;
    const n = studentCount;
    const { exp: perStudentExp, credits: perStudentCredits } = calculateLevelCost(current, target);
    const neededExp = perStudentExp * n;
    const neededCredits = perStudentCredits * n;
    const heldExp = aggregateStudentExp(counts);
    const deficitExp = Math.max(0, neededExp - heldExp);
    const breakdown = breakdownStudentExp(deficitExp);
    // 보유 EXP 를 N명에게 균등 분배했을 때 각자 도달 가능한 레벨
    const perStudentAvailable = Math.floor(heldExp / n);
    const { level: reachableLevel, leftover } = maxLevelFromExp(current, perStudentAvailable);
    const progress =
      neededExp <= 0 ? 100 : Math.min(100, Math.round((heldExp / neededExp) * 100));

    return {
      current,
      target,
      studentCount: n,
      perStudentExp,
      perStudentCredits,
      neededExp,
      neededCredits,
      heldExp,
      perStudentAvailable,
      deficitExp,
      breakdown,
      reachableLevel,
      leftover,
      progress,
      targetReached: target <= current,
      enough: deficitExp === 0 && target > current,
    };
  }, [currentLevel, targetLevel, studentCount, counts]);

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-extrabold text-blue-900 dark:text-blue-300 mb-2 tracking-tight">
        보고서 계산기
      </h1>
      <p className="text-sm text-gray-500 dark:text-slate-400 mb-6">
        학생 레벨업에 필요한 활동 보고서 양과 보유 보고서로 도달 가능한 레벨을 계산합니다.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 입력 영역 */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="p-4 md:p-5 bg-blue-50 dark:bg-blue-900/30 border-b border-gray-200 dark:border-slate-700">
            <h2 className="text-sm font-bold text-blue-800 dark:text-blue-300">입력</h2>
          </div>

          <div className="p-4 md:p-5 grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1.5">
                현재 레벨
              </label>
              <NumberInput
                min={1}
                max={STUDENT_MAX_LEVEL}
                value={currentLevel}
                onChange={setCurrentLevel}
                className="w-full p-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none dark:bg-slate-700 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1.5">
                목표 레벨
              </label>
              <NumberInput
                min={1}
                max={STUDENT_MAX_LEVEL}
                emptyValue={STUDENT_MAX_LEVEL}
                value={targetLevel}
                onChange={setTargetLevel}
                className="w-full p-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none dark:bg-slate-700 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1.5">
                학생 수
              </label>
              <NumberInput
                min={1}
                value={studentCount}
                onChange={setStudentCount}
                className="w-full p-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none dark:bg-slate-700 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="px-4 md:px-5 pb-4 md:pb-5">
            <div className="text-xs font-bold text-gray-700 dark:text-slate-300 mb-2">
              보유 활동 보고서
            </div>
            <div className="flex flex-col gap-2">
              {reportsDesc.map((it) => (
                <div key={it.key} className="flex items-center gap-3">
                  <img
                    src={itemIconUrl(it.icon)}
                    alt={it.name}
                    className="w-9 h-9 shrink-0"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-800 dark:text-slate-200 truncate">
                      {it.name}
                    </div>
                    <div className="text-[11px] text-gray-400 dark:text-slate-400">
                      {it.rarity} · +{formatNumber(it.exp)} EXP
                    </div>
                  </div>
                  <NumberInput
                    value={counts[it.key]}
                    onChange={(n) => setCounts((prev) => ({ ...prev, [it.key]: n }))}
                    className="w-24 p-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none dark:bg-slate-700 dark:text-slate-100 text-right"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 결과 영역 */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="p-4 md:p-5 bg-blue-50 dark:bg-blue-900/30 border-b border-gray-200 dark:border-slate-700">
            <h2 className="text-sm font-bold text-blue-800 dark:text-blue-300">결과</h2>
          </div>

          <div className="p-4 md:p-5 flex flex-col gap-4">
            {result.targetReached ? (
              <div className="text-sm text-gray-500 dark:text-slate-400 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg p-3">
                목표 레벨이 현재 레벨 이하입니다. 이미 목표에 도달했습니다.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg p-3">
                    <div className="text-[11px] text-gray-500 dark:text-slate-400 mb-1">
                      필요 EXP{result.studentCount > 1 ? ` (${result.studentCount}명 합)` : ''}
                    </div>
                    <div className="text-lg font-bold text-gray-800 dark:text-slate-200 tabular-nums">
                      {formatNumber(result.neededExp)}
                    </div>
                    {result.studentCount > 1 && (
                      <div className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5 tabular-nums">
                        1명당 {formatNumber(result.perStudentExp)}
                      </div>
                    )}
                  </div>
                  <div className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg p-3">
                    <div className="text-[11px] text-gray-500 dark:text-slate-400 mb-1">
                      필요 크레딧{result.studentCount > 1 ? ` (${result.studentCount}명 합)` : ''}
                    </div>
                    <div className="text-lg font-bold text-gray-800 dark:text-slate-200 tabular-nums">
                      {formatNumber(result.neededCredits)}
                    </div>
                    {result.studentCount > 1 && (
                      <div className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5 tabular-nums">
                        1명당 {formatNumber(result.perStudentCredits)}
                      </div>
                    )}
                  </div>
                </div>

                {/* 진행률 */}
                <div>
                  <div className="flex items-center justify-between text-xs text-gray-600 dark:text-slate-400 mb-1.5">
                    <span>진행률</span>
                    <span className="tabular-nums font-bold">{result.progress}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 dark:bg-blue-500 transition-all"
                      style={{ width: `${result.progress}%` }}
                    />
                  </div>
                </div>

                <div className="border-t border-gray-100 dark:border-slate-700 pt-4">
                  <div className="text-[11px] text-gray-500 dark:text-slate-400 mb-1">
                    보유 EXP · 도달 가능 레벨
                    {result.studentCount > 1 ? ` (${result.studentCount}명 균등 분배)` : ''}
                  </div>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-lg font-bold text-blue-700 dark:text-blue-300 tabular-nums">
                      Lv. {result.reachableLevel}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-slate-400 tabular-nums">
                      ({formatNumber(result.heldExp)} EXP 보유
                      {result.studentCount > 1
                        ? `, 1명당 ${formatNumber(result.perStudentAvailable)}`
                        : ''}
                      {result.leftover > 0
                        ? `, +${formatNumber(result.leftover)} 잔여`
                        : ''}
                      )
                    </span>
                  </div>
                </div>

                {result.enough ? (
                  <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg p-3">
                    <div className="text-sm font-bold text-green-700 dark:text-green-300">
                      보유 보고서로 목표 도달 가능
                    </div>
                    <div className="text-xs text-green-700/80 dark:text-green-300/80 mt-0.5">
                      추가 보고서가 필요하지 않습니다. (크레딧은 별도 확보 필요)
                    </div>
                  </div>
                ) : (
                  <div className="border-t border-gray-100 dark:border-slate-700 pt-4">
                    <div className="text-[11px] text-gray-500 dark:text-slate-400 mb-1">부족 EXP</div>
                    <div className="text-lg font-bold text-red-600 dark:text-red-400 tabular-nums mb-3">
                      {formatNumber(result.deficitExp)}
                    </div>

                    <div className="text-[11px] text-gray-500 dark:text-slate-400 mb-2">
                      부족분 권장 (큰 등급 우선)
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {result.breakdown.length === 0 ? (
                        <div className="text-xs text-gray-400 dark:text-slate-500">—</div>
                      ) : (
                        result.breakdown.map(({ source, count }) => (
                          <div key={source.key} className="flex items-center gap-2.5">
                            <img
                              src={itemIconUrl(source.icon)}
                              alt={source.name}
                              className="w-7 h-7 shrink-0"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                              }}
                            />
                            <div className="text-sm text-gray-700 dark:text-slate-300 flex-1 truncate">
                              {source.name}
                            </div>
                            <div className="text-sm font-bold text-gray-800 dark:text-slate-200 tabular-nums">
                              × {formatNumber(count)}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-2 leading-relaxed">
                      마지막 등급은 잔여를 올림 처리하기 때문에 표시 합계가 부족 EXP 보다 약간 많을 수 있습니다.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
