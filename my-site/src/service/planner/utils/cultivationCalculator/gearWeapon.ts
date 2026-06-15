// 고유장비 (Gear) / 고유무기 (Weapon) / 무기 성급 / 일반 장비 (Equipment).
//
// 크레딧 / 경험치는 items.min.json 에 1:1 대응되지 않으므로 synthetic 키 사용:
//   - 'credit'      : 크레딧
//   - 'weapon_exp'  : 고유무기 경험치 (신명석류)
// 학생 성급 + 전무 성급의 엘레프는 String(student.Id) 키.

import type { SchaleDBEquipment, SchaleDBStudent } from '@/types/schaledb';
import type {
  EquipmentTiers,
  GearRange,
  RequiredMaterials,
  WeaponRange,
  WeaponStarRange,
} from '@/types/planner';
import {
  CUMULATIVE_WEAPON_CREDIT,
  CUMULATIVE_WEAPON_EXP,
} from '../tables/weaponLevel';
import { CUMULATIVE_ELEPH, WEAPON_STAR_MAX } from '../tables/weaponStar';
import { addTo, type EquipmentMap } from './_shared';

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

/**
 * 학생 성급 + 전무 성급 통합 단계 변경 시 필요한 엘레프 누적량.
 * 키는 `String(student.Id)` — 학생 id 와 엘레프 item id 가 동일.
 */
export function calculateWeaponStarCost(
  student: SchaleDBStudent,
  range: WeaponStarRange,
): RequiredMaterials {
  const out: RequiredMaterials = {};
  const from = Math.max(1, Math.min(WEAPON_STAR_MAX, range.current));
  const to = Math.max(from, Math.min(WEAPON_STAR_MAX, range.target));
  const elephAmount = CUMULATIVE_ELEPH[to] - CUMULATIVE_ELEPH[from];
  if (elephAmount > 0) {
    addTo(out, String(student.Id), elephAmount);
  }
  return out;
}

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
      resolveRecipeRecursive(subEquipment.Recipe, totalQty, equipmentData, out);
      if (subEquipment.RecipeCost) {
        addTo(out, 'credit', subEquipment.RecipeCost * totalQty);
      }
    } else {
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
