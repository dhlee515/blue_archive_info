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
  PotentialsRange,
  RequiredMaterials,
  SkillRange,
  SkillsRange,
  WeaponRange,
  WeaponStarRange,
} from '@/types/planner';
import {
  CUMULATIVE_STUDENT_CREDIT,
  CUMULATIVE_STUDENT_EXP,
} from './tables/studentExp';
import {
  CUMULATIVE_WEAPON_CREDIT,
  CUMULATIVE_WEAPON_EXP,
} from './tables/weaponLevel';
import { CUMULATIVE_ELEPH, WEAPON_STAR_MAX } from './tables/weaponStar';
import {
  EX_SKILL_CREDIT_PER_STEP,
  EX_SKILL_MAX,
  NORMAL_SKILL_CREDIT_PER_STEP,
  NORMAL_SKILL_MASTERY_STEP,
  NORMAL_SKILL_MAX,
} from './tables/skillCost';
import {
  LOWER_ARTIFACT_DELTA,
  POTENTIAL_CREDIT_DELTA,
  POTENTIAL_MAX,
  REGULAR_ARTIFACT_DELTA,
  WB_DELTA,
  WB_ITEM_ID,
  type PotentialStatKey,
} from './tables/potentialLevel';

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
// 3-b) 고유무기 성급업 (학생 성급 1~4 + 전무 1~4 통합 1~8 단계)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 3-c) 스킬 강화 (EX + 기본/강화/서브)
// ---------------------------------------------------------------------------

/**
 * SchaleDB 의 SkillMaterial / SkillExMaterial row (id 배열) 와 amount row 를 합쳐
 * out 에 누적합니다. row 가 누락되면 무시.
 */
function addMaterialRow(
  out: RequiredMaterials,
  materials: number[][] | undefined,
  amounts: number[][] | undefined,
  rowIndex: number,
): void {
  if (!materials || !amounts) return;
  const matRow = materials[rowIndex];
  const amtRow = amounts[rowIndex];
  if (!matRow || !amtRow) return;

  for (let j = 0; j < matRow.length; j++) {
    addTo(out, String(matRow[j]), amtRow[j] ?? 0);
  }
}

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
    const idx = lv - 1; // 1→2 = idx 0 ... 8→9 = idx 7, 9→10 은 SchaleDB 외부
    if (lv < 9) {
      addMaterialRow(out, student.SkillMaterial, student.SkillMaterialAmount, idx);
      addTo(out, 'credit', NORMAL_SKILL_CREDIT_PER_STEP[idx] ?? 0);
    } else {
      // 9→10 (M단계)
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

// ---------------------------------------------------------------------------
// 3-d) 잠재력 (WB) 강화
// ---------------------------------------------------------------------------

/**
 * 잠재력 단일 스탯 강화 비용. delta 배열 합산.
 *  - 하급 오파츠 = student.PotentialMaterial
 *  - 일반 오파츠 = student.PotentialMaterial + 1
 *  - WB = WB_ITEM_ID[stat]
 *  - 크레딧 = synthetic 'credit'
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
