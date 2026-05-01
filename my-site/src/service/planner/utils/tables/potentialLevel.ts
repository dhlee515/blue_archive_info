// 잠재력 (WB) 강화 단계별 비용 — JSON 으로부터 로드되는 정적 테이블.
//
// 단계 1~25, 각 스탯별로 독립. 모든 학생/스탯 공통 비용 가정 (스탯 무관 동일).
// 학생별 분기는 PotentialMaterial id 만:
//   - PotentialMaterial      → 하급 (Rarity N) 오파츠
//   - PotentialMaterial + 1  → 일반 (Rarity R) 오파츠
//
// WB 아이템 id (사용자 선택 스탯에 따라):
//   - 2000  교양 체육 WB  (체력 강화)
//   - 2001  교양 사격 WB  (공격 강화)
//   - 2002  교양 위생 WB  (치명 강화)

import data from '@/data/planner/potential_level.json';

export const POTENTIAL_MAX: number = data.potentialMax;

/** 단계 i 로 강화 시 1회 비용 (delta). 인덱스 0 = placeholder. */
export const LOWER_ARTIFACT_DELTA: readonly number[] = data.lowerArtifactDelta;
export const REGULAR_ARTIFACT_DELTA: readonly number[] = data.regularArtifactDelta;
export const WB_DELTA: readonly number[] = data.wbDelta;
export const POTENTIAL_CREDIT_DELTA: readonly number[] = data.creditDelta;

/** 잠재력 스탯 종류 → WB item id */
export const WB_ITEM_ID = {
  hp: 2000,
  attack: 2001,
  crit: 2002,
} as const;

export type PotentialStatKey = keyof typeof WB_ITEM_ID;

/** UI 라벨 */
export const POTENTIAL_STAT_LABEL: Record<PotentialStatKey, string> = {
  hp: '체력',
  attack: '공격',
  crit: '치명',
};
