// 스킬 강화 (EX 1~5 + 일반 1~10).
//
// 기본/강화/서브 는 동일 SkillMaterial 을 공유 (3종 동일 비용).
// EX 와 일반 (1~9) 은 SkillMaterial / SkillExMaterial 행 + 단계별 크레딧.
// 일반 9→10 (M단계) 은 SchaleDB 외부 — NORMAL_SKILL_MASTERY_STEP (비의서 1 + 크레딧 4M).

import type { SchaleDBStudent } from '@/types/schaledb';
import type { RequiredMaterials, SkillRange, SkillsRange } from '@/types/planner';
import {
  EX_SKILL_CREDIT_PER_STEP,
  EX_SKILL_MAX,
  NORMAL_SKILL_CREDIT_PER_STEP,
  NORMAL_SKILL_MASTERY_STEP,
  NORMAL_SKILL_MAX,
} from '../tables/skillCost';
import { addMaterialRow, addTo, mergeInto } from './_shared';

/**
 * EX 스킬 1~5 강화 비용. SkillExMaterial 4행 + EX_SKILL_CREDIT_PER_STEP 4개.
 */
export function calculateExSkillCost(
  student: SchaleDBStudent,
  range: SkillRange,
): RequiredMaterials {
  const out: RequiredMaterials = {};
  const from = Math.max(1, Math.min(EX_SKILL_MAX, range.current));
  const to = Math.max(from, Math.min(EX_SKILL_MAX, range.target));

  for (let lv = from; lv < to; lv++) {
    const idx = lv - 1; // 1→2 = idx 0 ... 4→5 = idx 3
    addMaterialRow(out, student.SkillExMaterial, student.SkillExMaterialAmount, idx);
    addTo(out, 'credit', EX_SKILL_CREDIT_PER_STEP[idx] ?? 0);
  }
  return out;
}

/**
 * 일반 스킬 (기본/강화/서브 1종) 1~10 강화 비용.
 *  - 1→9: SkillMaterial 8행 + NORMAL_SKILL_CREDIT_PER_STEP
 *  - 9→10: NORMAL_SKILL_MASTERY_STEP (비의서 1 + 크레딧 4M)
 */
export function calculateNormalSkillCost(
  student: SchaleDBStudent,
  range: SkillRange,
): RequiredMaterials {
  const out: RequiredMaterials = {};
  const from = Math.max(1, Math.min(NORMAL_SKILL_MAX, range.current));
  const to = Math.max(from, Math.min(NORMAL_SKILL_MAX, range.target));

  for (let lv = from; lv < to; lv++) {
    const idx = lv - 1;
    if (lv < 9) {
      addMaterialRow(out, student.SkillMaterial, student.SkillMaterialAmount, idx);
      addTo(out, 'credit', NORMAL_SKILL_CREDIT_PER_STEP[idx] ?? 0);
    } else {
      addTo(out, String(NORMAL_SKILL_MASTERY_STEP.bookId), NORMAL_SKILL_MASTERY_STEP.bookAmount);
      addTo(out, 'credit', NORMAL_SKILL_MASTERY_STEP.credit);
    }
  }
  return out;
}

/**
 * 4개 스킬 트랙 (EX/기본/강화/서브) 합산.
 * 기본/강화/서브 는 동일 SkillMaterial 을 공유 (3종 동일 비용).
 */
export function calculateSkillsCost(
  student: SchaleDBStudent,
  skills: SkillsRange,
): RequiredMaterials {
  const out: RequiredMaterials = {};
  mergeInto(out, calculateExSkillCost(student, skills.ex));
  mergeInto(out, calculateNormalSkillCost(student, skills.normal));
  mergeInto(out, calculateNormalSkillCost(student, skills.passive));
  mergeInto(out, calculateNormalSkillCost(student, skills.sub));
  return out;
}
