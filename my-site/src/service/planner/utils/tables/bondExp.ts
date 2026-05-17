// 인연랭크 누적 EXP — 파생 계산 유틸
//
// 데이터 원본: src/data/planner/bond_exp.json
//   - expDelta[i] : 인연랭크 (i-1) → i 구간 비용
//   - 인덱스 0, 1 은 placeholder (0)
//
// 출처: 자료/인랭 계산기/인랭 경험치 테이블.webp (한섭 기준 1~100)
//   - SchaleDB 는 인연 EXP 곡선을 호스팅하지 않아 하드코딩 JSON 으로 관리.
//   - SchaleDB config 의 BondMaxLevel 은 Jp/Global/Cn 모두 50 으로 표기되어 있으나,
//     한섭은 100 까지 가능하며 SchaleDB 가 한섭 region 을 별도 두지 않은 것으로 추정.

import bondExpData from '@/data/planner/bond_exp.json';

/** 인연랭크 최대 (한섭 기준) */
export const BOND_MAX_LEVEL: number = bondExpData.maxLevel;

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
 * 누적 인연 EXP — CUMULATIVE_BOND_EXP[level] = 인연랭크 1 에서 `level` 까지 총 EXP.
 * CUMULATIVE_BOND_EXP[1] = 0, CUMULATIVE_BOND_EXP[100] = 240_225.
 */
export const CUMULATIVE_BOND_EXP: readonly number[] = cumSum(bondExpData.expDelta);
