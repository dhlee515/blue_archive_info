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
  SchaleDBItem,
  SchaleDBStudent,
} from '@/types/schaledb';
import type {
  BondRange,
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
import { CUMULATIVE_BOND_EXP } from './tables/bondExp';

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
// 4-b) 인연랭크 (Bond) — 선물 권장 + 매칭 배수
// ---------------------------------------------------------------------------

/**
 * 인연랭크 `current → target` 누적 EXP.
 * SchaleDB 의 `ExpValue × min(matchingCount, 3) + 1` 공식과 함께 사용.
 */
export function calculateBondExp(current: number, target: number): number {
  const max = CUMULATIVE_BOND_EXP.length - 1;
  const from = Math.max(1, Math.min(max, current));
  const to = Math.max(from, Math.min(max, target));
  return CUMULATIVE_BOND_EXP[to] - CUMULATIVE_BOND_EXP[from];
}

/**
 * 학생-아이템 선호 배수 (1/2/3/4). SchaleDB common.js:5333-5347 와 동일 union 합산.
 *   allTags = FavorItemTags ∪ FavorItemUniqueTags ∪ CommonFavorItemTags
 *   matchCount = |item.Tags ∩ allTags|
 *   배수 = min(matchCount, 3) + 1
 *
 * UniqueTags/CommonTags 도 동일하게 1점씩 카운트 (가중치 없음).
 */
export function favorMultiplier(
  student: SchaleDBStudent,
  item: SchaleDBItem,
  commonTags: readonly string[],
): 1 | 2 | 3 | 4 {
  const allTags = new Set<string>([
    ...(student.FavorItemTags ?? []),
    ...(student.FavorItemUniqueTags ?? []),
    ...commonTags,
  ]);
  const matchCount = (item.Tags ?? []).filter((t) => allTags.has(t)).length;
  return (Math.min(matchCount, 3) + 1) as 1 | 2 | 3 | 4;
}

/** 인연 권장 모드 (v2 확장 포인트). 현재는 'efficient' 만 지원. */
export type BondMode = 'efficient';

/**
 * 한 학생의 인연랭크 목표 달성을 위한 권장 선물량.
 *
 * 알고리즘 (OQ-3 = A, 2-phase):
 *   1. neededExp = calculateBondExp(current, target)
 *   2. 모든 Favor 아이템을 `(multiplier desc, expPerItem desc, 보유량 asc)` 정렬
 *   3. Phase A — 보유 인벤토리를 효율 순으로 소비 (보유량 한도 내)
 *   4. Phase B — 남은 EXP 가 있으면 가장 효율적인 선물(이상 아이템) 로 채움 (인벤토리 무관)
 *   5. recommended[itemId] = 총 권장량 (보유분 사용 + 획득 필요). 다른 재료처럼 deficit 계산에 합산됨.
 *
 * shortfallExp 는 학생이 좋아하는 Favor 아이템이 1개도 없을 때만 > 0
 * (현실적으로 항상 0).
 */
export function calculateBondGifts(
  student: SchaleDBStudent,
  range: BondRange,
  inventory: InventoryMap,
  commonTags: readonly string[],
  favorItems: readonly SchaleDBItem[],
  _mode: BondMode = 'efficient',
): { recommended: RequiredMaterials; shortfallExp: number } {
  const recommended: RequiredMaterials = {};
  let remaining = calculateBondExp(range.current, range.target);
  if (remaining <= 0) return { recommended, shortfallExp: 0 };

  type Candidate = { item: SchaleDBItem; mult: 1 | 2 | 3 | 4; expPerItem: number; inv: number };
  const candidates: Candidate[] = [];
  for (const item of favorItems) {
    if ((item.ExpValue ?? 0) <= 0) continue;
    const mult = favorMultiplier(student, item, commonTags);
    const inv = inventory[String(item.Id)] ?? 0;
    candidates.push({ item, mult, expPerItem: (item.ExpValue ?? 0) * mult, inv });
  }

  candidates.sort((a, b) => {
    if (a.mult !== b.mult) return b.mult - a.mult;
    if (a.expPerItem !== b.expPerItem) return b.expPerItem - a.expPerItem;
    return a.inv - b.inv;
  });

  // Phase A: 보유 인벤토리 소비
  for (const c of candidates) {
    if (remaining <= 0) break;
    if (c.inv <= 0) continue;
    const maxNeeded = Math.ceil(remaining / c.expPerItem);
    const use = Math.min(c.inv, maxNeeded);
    if (use > 0) {
      recommended[String(c.item.Id)] = (recommended[String(c.item.Id)] ?? 0) + use;
      remaining -= use * c.expPerItem;
    }
  }

  // Phase B: 부족분을 이상 아이템 (가장 효율 높은 선물) 로 채움
  if (remaining > 0 && candidates.length > 0) {
    const best = candidates[0];
    const need = Math.ceil(remaining / best.expPerItem);
    recommended[String(best.item.Id)] = (recommended[String(best.item.Id)] ?? 0) + need;
    remaining -= need * best.expPerItem;
  }

  return { recommended, shortfallExp: Math.max(0, remaining) };
}

/** itemsData 에서 Favor 카테고리만 추출하는 헬퍼 */
export function getFavorItems(itemsData: Record<string, SchaleDBItem>): SchaleDBItem[] {
  return Object.values(itemsData).filter((it) => it.Category === 'Favor');
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
// 5-b) 인연 통합 집계 (gear + bond 합산, 출처 breakdown 메타 포함)
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
