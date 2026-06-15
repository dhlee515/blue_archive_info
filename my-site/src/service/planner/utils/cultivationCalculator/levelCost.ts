// 학생 레벨업 — 누적 EXP + 크레딧 (하드코딩 테이블).

import {
  CUMULATIVE_STUDENT_CREDIT,
  CUMULATIVE_STUDENT_EXP,
} from '../tables/studentExp';

/**
 * 학생 레벨 `current` → `target` 까지 필요한 누적 EXP + 크레딧.
 * 현재 레벨이 목표 이상이면 0 반환.
 */
export function calculateLevelCost(current: number, target: number): {
  exp: number;
  credits: number;
} {
  const max = CUMULATIVE_STUDENT_EXP.length - 1;
  const from = Math.max(1, Math.min(max, current));
  const to = Math.max(from, Math.min(max, target));

  return {
    exp: CUMULATIVE_STUDENT_EXP[to] - CUMULATIVE_STUDENT_EXP[from],
    credits: CUMULATIVE_STUDENT_CREDIT[to] - CUMULATIVE_STUDENT_CREDIT[from],
  };
}
