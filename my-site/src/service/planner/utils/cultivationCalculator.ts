// 육성 플래너 — 필요 재료 계산 (순수 함수)
//
// - 학생 레벨업 : 하드코딩 EXP / 크레딧 테이블 (studentExp.ts)
// - 고유장비 (Gear) : SchaleDBStudent.Gear.TierUpMaterial[Amount] 직접 사용
// - 고유무기 (Weapon) 레벨업 : 하드코딩 EXP / 크레딧 테이블 (weaponLevel.ts)
// - 일반 장비 : equipment.min.json 의 Recipe 재귀 풀기 → 기본 재료까지 평탄화
//
// 크레딧 / 경험치는 items.min.json 에 1:1 대응되지 않으므로
// synthetic 키를 사용합니다:
//   - 'credit'       : 크레딧
//   - 'student_exp'  : 학생 경험치 (보고서 레벨업 아이템은 여기에 합산)
//   - 'weapon_exp'   : 고유무기 경험치 (신명석류)
// UI 레이어에서 숫자 vs synthetic 키를 구분해 렌더합니다.

import type {
  SchaleDBEquipment,
  SchaleDBStudent,
} from '@/types/schaledb';
import type {
  DeficitReport,
  EquipmentTiers,
  GearRange,
  InventoryMap,
  LevelRange,
  PlannerStudent,
  PlannerTargets,
  RequiredMaterials,
  WeaponRange,
} from '@/types/planner';
import {
  CUMULATIVE_STUDENT_CREDIT,
  CUMULATIVE_STUDENT_EXP,
} from './tables/studentExp';
import {
  CUMULATIVE_WEAPON_CREDIT,
  CUMULATIVE_WEAPON_EXP,
} from './tables/weaponLevel';

/** 일반 장비 id → 장비 데이터 맵 (equipment.min.json 은 Record 형태) */
export type EquipmentMap = Record<string, SchaleDBEquipment>;

/** RequiredMaterials 에 수량을 더하는 헬퍼 */
function addTo(out: RequiredMaterials, key: string, qty: number): void {
  if (qty <= 0) return;
  out[key] = (out[key] ?? 0) + qty;
}

/** 두 RequiredMaterials 를 병합 (a 에 b 를 더함) */
function mergeInto(a: RequiredMaterials, b: RequiredMaterials): void {
  for (const [key, qty] of Object.entries(b)) {
    addTo(a, key, qty);
  }
}

// ---------------------------------------------------------------------------
// 1) 학생 레벨업
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 2) 고유장비 (Gear) 티어업
// ---------------------------------------------------------------------------

/**
 * 고유장비(Gear) 티어업 재료 누적.
 *
 * `SchaleDBStudent.Gear.TierUpMaterial` / `TierUpMaterialAmount` 는 2D 배열.
 *   인덱스 i 는 "티어 (i+1) → (i+2)" 구간의 재료.
 * 티어 0 (미해금) → 1 은 임무 해금이라 재료 비용이 0 (배열에 row 없음).
 */
export function calculateGearCost(
  student: SchaleDBStudent,
  range: GearRange,
): RequiredMaterials {
  const out: RequiredMaterials = {};
  const gear = student.Gear;
  if (!gear?.TierUpMaterial || !gear.TierUpMaterialAmount) return out;
  if (range.targetTier <= range.currentTier) return out;

  const materials = gear.TierUpMaterial;
  const amounts = gear.TierUpMaterialAmount;

  for (let k = range.currentTier; k < range.targetTier; k++) {
    const idx = k - 1; // 티어 k → k+1 은 인덱스 k-1
    if (idx < 0 || idx >= materials.length) continue;
    const matRow = materials[idx];
    const amtRow = amounts[idx];
    if (!matRow || !amtRow) continue;

    for (let j = 0; j < matRow.length; j++) {
      addTo(out, String(matRow[j]), amtRow[j] ?? 0);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 3) 고유무기 (Weapon) 레벨업
// ---------------------------------------------------------------------------

/**
 * 고유무기 레벨 `range.currentLevel` → `range.targetLevel` 누적 EXP/크레딧.
 * 무기 레벨 0 (미해금) 은 학생 5성 해금이므로 재료 비용 없이 레벨 1 로 시작.
 */
export function calculateWeaponCost(
  _student: SchaleDBStudent,
  range: WeaponRange,
): RequiredMaterials {
  const out: RequiredMaterials = {};
  const max = CUMULATIVE_WEAPON_EXP.length - 1;
  const from = Math.max(1, Math.min(max, range.currentLevel));
  const to = Math.max(from, Math.min(max, range.targetLevel));

  addTo(out, 'weapon_exp', CUMULATIVE_WEAPON_EXP[to] - CUMULATIVE_WEAPON_EXP[from]);
  addTo(out, 'credit', CUMULATIVE_WEAPON_CREDIT[to] - CUMULATIVE_WEAPON_CREDIT[from]);
  return out;
}

// ---------------------------------------------------------------------------
// 4) 일반 장비 티어업 — Recipe 재귀 평탄화
// ---------------------------------------------------------------------------

/**
 * 주어진 (category, tier) 에 해당하는 장비를 equipmentData 에서 찾습니다.
 */
function findEquipment(
  equipmentData: EquipmentMap,
  category: string,
  tier: number,
): SchaleDBEquipment | null {
  for (const eq of Object.values(equipmentData)) {
    if (eq.Category === category && eq.Tier === tier) return eq;
  }
  return null;
}

/**
 * Recipe 를 기본 재료까지 재귀적으로 평탄화해 out 에 누적합니다.
 * - 재료 id 가 equipmentData 에 있으면 → 하위 장비 (recipe 재귀)
 * - 없으면 → 기본 재료 (items.min.json)
 *
 * qtyMultiplier 만큼 복제.
 */
function resolveRecipeRecursive(
  recipe: [number, number][],
  qtyMultiplier: number,
  equipmentData: EquipmentMap,
  out: RequiredMaterials,
): void {
  for (const [materialId, qty] of recipe) {
    const totalQty = qty * qtyMultiplier;
    const subEquipment = equipmentData[String(materialId)];
    if (subEquipment?.Recipe) {
      // 하위 티어 장비 → 재귀
      resolveRecipeRecursive(subEquipment.Recipe, totalQty, equipmentData, out);
      if (subEquipment.RecipeCost) {
        addTo(out, 'credit', subEquipment.RecipeCost * totalQty);
      }
    } else {
      // 기본 재료
      addTo(out, String(materialId), totalQty);
    }
  }
}

/**
 * 일반 장비 슬롯별 티어업 비용.
 * - current / target 배열 길이 == slotCategories.length 가정
 * - 각 슬롯에서 currentTier+1 ~ targetTier 범위의 장비를 1개씩 제작
 */
export function calculateEquipmentCost(
  current: EquipmentTiers,
  target: EquipmentTiers,
  slotCategories: string[],
  equipmentData: EquipmentMap,
): RequiredMaterials {
  const out: RequiredMaterials = {};
  const slotCount = slotCategories.length;

  for (let slot = 0; slot < slotCount; slot++) {
    const category = slotCategories[slot];
    const from = current[slot] ?? 1;
    const to = target[slot] ?? 1;
    if (to <= from) continue;

    for (let tier = from + 1; tier <= to; tier++) {
      const eq = findEquipment(equipmentData, category, tier);
      if (!eq?.Recipe) continue;

      resolveRecipeRecursive(eq.Recipe, 1, equipmentData, out);
      if (eq.RecipeCost) {
        addTo(out, 'credit', eq.RecipeCost);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 5) 학생 1명 집계 & 전체 합산
// ---------------------------------------------------------------------------

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
// 6) 부족 계산
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
