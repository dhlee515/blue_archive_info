// 잠재력 (WB) 강화 — 체력/공격/치명.
//
// 하급/일반 오파츠 = student.PotentialMaterial / .PotentialMaterial+1
// WB = WB_ITEM_ID[stat], 크레딧 = synthetic 'credit'.

import type { SchaleDBStudent } from '@/types/schaledb';
import type { PotentialsRange, RequiredMaterials } from '@/types/planner';
import {
  LOWER_ARTIFACT_DELTA,
  POTENTIAL_CREDIT_DELTA,
  POTENTIAL_MAX,
  REGULAR_ARTIFACT_DELTA,
  WB_DELTA,
  WB_ITEM_ID,
  type PotentialStatKey,
} from '../tables/potentialLevel';
import { addTo, mergeInto } from './_shared';

/**
 * 잠재력 단일 스탯 강화 비용. delta 배열 합산.
 *
 * range.current = 0 (미강화) ~ 25, range.target = same.
 * PotentialMaterial 이 없는 학생은 오파츠 비용 생략 (WB/크레딧 만 산정).
 */
function calculatePotentialStatCost(
  student: SchaleDBStudent,
  stat: PotentialStatKey,
  range: { current: number; target: number },
): RequiredMaterials {
  const out: RequiredMaterials = {};
  const from = Math.max(0, Math.min(POTENTIAL_MAX, range.current));
  const to = Math.max(from, Math.min(POTENTIAL_MAX, range.target));
  if (to === from) return out;

  let lower = 0;
  let regular = 0;
  let wb = 0;
  let credit = 0;
  for (let lv = from + 1; lv <= to; lv++) {
    lower += LOWER_ARTIFACT_DELTA[lv] ?? 0;
    regular += REGULAR_ARTIFACT_DELTA[lv] ?? 0;
    wb += WB_DELTA[lv] ?? 0;
    credit += POTENTIAL_CREDIT_DELTA[lv] ?? 0;
  }

  if (student.PotentialMaterial !== undefined) {
    addTo(out, String(student.PotentialMaterial), lower);
    addTo(out, String(student.PotentialMaterial + 1), regular);
  }
  addTo(out, String(WB_ITEM_ID[stat]), wb);
  addTo(out, 'credit', credit);
  return out;
}

/** 3개 스탯 잠재력 합산 (체력/공격/치명) */
export function calculatePotentialsCost(
  student: SchaleDBStudent,
  potentials: PotentialsRange,
): RequiredMaterials {
  const out: RequiredMaterials = {};
  mergeInto(out, calculatePotentialStatCost(student, 'hp', potentials.hp));
  mergeInto(out, calculatePotentialStatCost(student, 'attack', potentials.attack));
  mergeInto(out, calculatePotentialStatCost(student, 'crit', potentials.crit));
  return out;
}
