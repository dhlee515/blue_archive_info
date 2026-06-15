// 학생 1명 → 전체 합산 → 인연 통합 → 부족 계산.
//
// 단방향 의존: 모든 domain (level/gear/skill/potential/bond) 의 함수를 호출해서
// RequiredMaterials 로 합치고, 인연 권장은 별도 breakdown 으로 출처 메타 보관.

import type { SchaleDBItem, SchaleDBStudent } from '@/types/schaledb';
import type {
  DeficitReport,
  InventoryMap,
  PlannerStudent,
  PlannerTargets,
  RequiredMaterials,
} from '@/types/planner';
import { addTo, mergeInto, type EquipmentMap } from './_shared';
import { calculateLevelCost } from './levelCost';
import {
  calculateEquipmentCost,
  calculateGearCost,
  calculateWeaponCost,
  calculateWeaponStarCost,
} from './gearWeapon';
import { calculateSkillsCost } from './skills';
import { calculatePotentialsCost } from './potentials';
import {
  calculateBondExp,
  calculateBondGifts,
  getFavorItems,
} from './bondGifts';

/**
 * 학생 1명의 모든 요소(level/gear/weapon/equipment)를 합산.
 */
export function aggregatePerStudent(
  student: SchaleDBStudent,
  targets: PlannerTargets,
  equipmentData: EquipmentMap,
): RequiredMaterials {
  const out: RequiredMaterials = {};

  // 학생 레벨
  const levelCost = calculateLevelCost(targets.level.current, targets.level.target);
  addTo(out, 'student_exp', levelCost.exp);
  addTo(out, 'credit', levelCost.credits);

  // 고유장비 (Gear)
  if (targets.gear) {
    mergeInto(out, calculateGearCost(student, targets.gear));
  }

  // 고유무기 (Weapon)
  if (targets.weapon) {
    mergeInto(out, calculateWeaponCost(student, targets.weapon));
  }

  // 고유무기 성급 + 학생 성급 (엘레프)
  if (targets.weaponStar) {
    mergeInto(out, calculateWeaponStarCost(student, targets.weaponStar));
  }

  // 일반 장비 (Equipment)
  if (targets.equipment && student.Equipment?.length) {
    mergeInto(
      out,
      calculateEquipmentCost(
        targets.equipment.current,
        targets.equipment.target,
        student.Equipment,
        equipmentData,
      ),
    );
  }

  // 스킬 (EX + 기본/강화/서브)
  if (targets.skills) {
    mergeInto(out, calculateSkillsCost(student, targets.skills));
  }

  // 잠재력 (WB) — 체력/공격/치명
  if (targets.potentials) {
    mergeInto(out, calculatePotentialsCost(student, targets.potentials));
  }

  return out;
}

/**
 * 전체 플래너 학생의 누적 필요 재료.
 * - `studentsData` 에 없는 studentId 는 건너뜀 (로그만)
 */
export function aggregateAll(
  plannerStudents: PlannerStudent[],
  studentsData: Record<string, SchaleDBStudent>,
  equipmentData: EquipmentMap,
): RequiredMaterials {
  const out: RequiredMaterials = {};

  for (const ps of plannerStudents) {
    const student = studentsData[String(ps.studentId)];
    if (!student) {
      console.warn(`[planner] 학생 데이터 없음: ${ps.studentId}`);
      continue;
    }
    mergeInto(out, aggregatePerStudent(student, ps.targets, equipmentData));
  }
  return out;
}

// ---------------------------------------------------------------------------
// 인연 통합 집계 (gear + bond 합산, 출처 breakdown 메타 포함)
// ---------------------------------------------------------------------------

/** 한 아이템의 출처별 demand (애장품 vs 인연). 합 = required[itemId]. */
export interface MaterialBreakdown {
  gear: number;
  bond: number;
}

/** 한 학생의 인연 계획 — UI 의 "인연 권장 선물" 섹션에서 사용. */
export interface BondPlan {
  /** 인연 N → M 누적 EXP */
  neededExp: number;
  /** 권장 선물 사용량 (itemId → 개수) */
  recommended: RequiredMaterials;
  /** 인벤토리만으로 목표 미달 시 남은 EXP. 0 이면 충족. */
  shortfallExp: number;
}

/** aggregateAllWithBond 결과 */
export interface BondAwareAggregate {
  /** 합산 필요 재료 (gear + bond) — 기존 RequiredMaterials 와 동일 shape */
  required: RequiredMaterials;
  /** 인연 권장이 기여한 아이템에 한해 출처 분해. 없는 키는 100% gear. */
  breakdown: Record<string, MaterialBreakdown>;
  /** 학생별 인연 계획 (planner_student.id 기준). bond 목표가 있는 학생만 키 존재. */
  bondPlans: Record<string, BondPlan>;
}

/**
 * 전체 플래너 학생의 누적 필요 재료 + 인연 권장 합산.
 *
 * 기존 `aggregateAll` 결과에 각 학생의 `calculateBondGifts.recommended` 를 동일 itemId 슬롯으로 합산.
 * 출처 분해는 `breakdown` 에 보관 — UI 의 hover 분해 표시용.
 *
 * 인연 권장은 인벤토리 기반 (`calculateBondGifts` 가 보유량 한도 내에서 소비) —
 * 다중 학생이 같은 아이템을 권장하면 합계가 인벤토리를 초과할 수 있으며, 그 차이는 `deficit` 에 반영.
 */
export function aggregateAllWithBond(
  plannerStudents: PlannerStudent[],
  studentsData: Record<string, SchaleDBStudent>,
  equipmentData: EquipmentMap,
  itemsData: Record<string, SchaleDBItem>,
  inventory: InventoryMap,
  commonTags: readonly string[] = [],
): BondAwareAggregate {
  const required: RequiredMaterials = {};
  const breakdown: Record<string, MaterialBreakdown> = {};
  const bondPlans: Record<string, BondPlan> = {};

  const favorItems = getFavorItems(itemsData);

  for (const ps of plannerStudents) {
    const student = studentsData[String(ps.studentId)];
    if (!student) {
      console.warn(`[planner] 학생 데이터 없음: ${ps.studentId}`);
      continue;
    }

    // 기존 (gear/level/skill/etc.) 집계
    const gearLike = aggregatePerStudent(student, ps.targets, equipmentData);
    for (const [itemId, qty] of Object.entries(gearLike)) {
      addTo(required, itemId, qty);
      const b = (breakdown[itemId] ??= { gear: 0, bond: 0 });
      b.gear += qty;
    }

    // 인연 권장
    if (ps.targets.bond) {
      const neededExp = calculateBondExp(ps.targets.bond.current, ps.targets.bond.target);
      if (neededExp > 0) {
        const { recommended, shortfallExp } = calculateBondGifts(
          student, ps.targets.bond, inventory, commonTags, favorItems,
        );
        for (const [itemId, qty] of Object.entries(recommended)) {
          addTo(required, itemId, qty);
          const b = (breakdown[itemId] ??= { gear: 0, bond: 0 });
          b.bond += qty;
        }
        bondPlans[ps.id] = { neededExp, recommended, shortfallExp };
      }
    }
  }

  return { required, breakdown, bondPlans };
}

// ---------------------------------------------------------------------------
// 부족 계산
// ---------------------------------------------------------------------------

export function computeDeficit(
  required: RequiredMaterials,
  owned: InventoryMap,
): DeficitReport {
  const deficit: RequiredMaterials = {};
  for (const [key, req] of Object.entries(required)) {
    const have = owned[key] ?? 0;
    const short = req - have;
    if (short > 0) deficit[key] = short;
  }
  return { required, owned, deficit };
}
