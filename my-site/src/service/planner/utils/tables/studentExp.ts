// 학생 레벨업 누적 EXP / 크레딧 — 파생 계산 유틸
//
// 데이터 원본: src/data/planner/student_level.json
//   - expDelta, creditDelta : 인덱스 i 는 레벨 (i-1) → i 구간 비용
//   - 인덱스 0, 1 은 placeholder (0)
//
// 출처: 게임 에셋 추출 기반 커뮤니티 자료
//   - Futottakakka/bluearchive-expcalc (calc.js)
//   - sensei.lol/expcalc.html
//   - 나무위키 블루아카이브 테이블
//
// SchaleDB 는 이 테이블을 호스팅하지 않아 하드코딩 JSON 으로 관리.

import studentLevelData from '@/data/planner/student_level.json';

/** 학생 최대 레벨 (KR / Global 기준) */
export const STUDENT_MAX_LEVEL: number = studentLevelData.maxLevel;

function cumSum(arr: readonly number[]): number[] {
  const out: number[] = [];
  let sum = 0;
  for (const x of arr) {
    sum += x;
    out.push(sum);
  }
  return out;
}

/**
 * 누적 EXP — CUMULATIVE_STUDENT_EXP[level] = 레벨 1 에서 `level` 까지 총 EXP.
 * CUMULATIVE_STUDENT_EXP[1] = 0, CUMULATIVE_STUDENT_EXP[90] = 1_249_185.
 */
export const CUMULATIVE_STUDENT_EXP: readonly number[] = cumSum(studentLevelData.expDelta);

/** 누적 크레딧 — 같은 인덱싱 규칙 */
export const CUMULATIVE_STUDENT_CREDIT: readonly number[] = cumSum(studentLevelData.creditDelta);
