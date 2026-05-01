// 고유무기(Weapon) 레벨업 누적 EXP / 크레딧 + 성급별 레벨 상한
//
// 데이터 원본: src/data/planner/weapon_level.json
//   - expDelta, creditDelta : 인덱스 i 는 레벨 (i-1) → i 구간 비용
//   - 인덱스 0, 1 은 placeholder (0)
//   - starMaxLevels[starCount] = 해당 성급에서 도달 가능한 최대 레벨
//
// 출처: 게임 에셋 추출 기반 커뮤니티 자료 (sensei.lol / 나무위키 등)
//
// 주의: 이 테이블은 무기의 **레벨업** 비용만 다룸.
// 성급업(1→2→3→4성) 에 필요한 학생 엘레프 조각은 별도 리소스.

import weaponLevelData from '@/data/planner/weapon_level.json';

/** 고유무기 최대 레벨 (KR / Global = 60, JP = 50) */
export const WEAPON_MAX_LEVEL: number = weaponLevelData.maxLevel;

/**
 * 성급별 레벨 상한.
 * 인덱스 = 성급(1~4), 0은 placeholder.
 *   WEAPON_STAR_MAX_LEVELS[1] = 30  (1성 최대)
 *   WEAPON_STAR_MAX_LEVELS[4] = 60  (4성 최대)
 */
export const WEAPON_STAR_MAX_LEVELS: readonly number[] = weaponLevelData.starMaxLevels;

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
 * 누적 EXP — CUMULATIVE_WEAPON_EXP[level] = 레벨 1 에서 `level` 까지 총 EXP.
 * CUMULATIVE_WEAPON_EXP[1] = 0, CUMULATIVE_WEAPON_EXP[60] = 49_605.
 */
export const CUMULATIVE_WEAPON_EXP: readonly number[] = cumSum(weaponLevelData.expDelta);

/** 누적 크레딧 — 같은 인덱싱 규칙. CUMULATIVE_WEAPON_CREDIT[60] = 8_928_900 */
export const CUMULATIVE_WEAPON_CREDIT: readonly number[] = cumSum(weaponLevelData.creditDelta);
