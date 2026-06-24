// 보고서 계산기 — 보유 EXP 로 도달 가능 레벨 산정.
//
// CUMULATIVE_STUDENT_EXP[level] 은 레벨 1 에서 `level` 까지의 누적 EXP.
// `currentLevel` 의 누적 EXP 에 `availableExp` 를 더한 값이 다음 레벨 누적치를 넘기 직전까지 올라간다.

import { CUMULATIVE_STUDENT_EXP } from '@/service/planner/utils/tables/studentExp';

export interface MaxLevelResult {
  level: number;
  /** 도달 레벨에서 다음 레벨까지 가지 못한 잔여 EXP */
  leftover: number;
}

export function maxLevelFromExp(currentLevel: number, availableExp: number): MaxLevelResult {
  const max = CUMULATIVE_STUDENT_EXP.length - 1;
  const from = Math.max(1, Math.min(max, currentLevel));
  const available = Math.max(0, availableExp);
  const targetCum = CUMULATIVE_STUDENT_EXP[from] + available;

  // max=90 이라 linear 검색 충분.
  let level = from;
  for (let lv = from; lv <= max; lv++) {
    if (CUMULATIVE_STUDENT_EXP[lv] <= targetCum) level = lv;
    else break;
  }
  const leftover = targetCum - CUMULATIVE_STUDENT_EXP[level];
  return { level, leftover };
}
