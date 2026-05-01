// 스킬 강화 비용 — JSON 으로부터 로드되는 정적 테이블.
//
// 일반 스킬 (기본/강화/서브) 1→9 : SchaleDBStudent.SkillMaterial[7행] + 크레딧 8개
// 일반 스킬 9→10 (M단계)         : 비의서 1 + 크레딧 4M (SchaleDB 외부)
// EX 스킬 1→5                    : SchaleDBStudent.SkillExMaterial[4행] + 크레딧 4개

import skillCostData from '@/data/planner/skill_cost.json';

export const NORMAL_SKILL_MAX = 10;
export const EX_SKILL_MAX = 5;

/** 기본/강화/서브 스킬 1→2, 2→3, ..., 8→9 의 크레딧. 길이 8. */
export const NORMAL_SKILL_CREDIT_PER_STEP: readonly number[] =
  skillCostData.normalSkillCredit;

/** 일반 스킬 9→10 마스터 단계 — 비의서 1개 + 크레딧 4,000,000 */
export const NORMAL_SKILL_MASTERY_STEP: {
  readonly bookId: number;
  readonly bookAmount: number;
  readonly credit: number;
} = skillCostData.normalSkillMasteryStep;

/** EX 스킬 1→2, 2→3, 3→4, 4→5 의 크레딧. 길이 4. */
export const EX_SKILL_CREDIT_PER_STEP: readonly number[] =
  skillCostData.exSkillCredit;
