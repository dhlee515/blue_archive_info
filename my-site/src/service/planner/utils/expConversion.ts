// EXP 환산 + 무기 부품 보너스 매핑 — exp_conversion.json 파생 헬퍼.
//
// 인벤토리 키 prefix:
//   report:<id>   — 학생 활동 보고서 (items.min.json id 10~13)  — 학생 EXP 환산
//   wpart:<id>    — 무기 부품 4시리즈 × 4등급 (equipment.min.json id 10~43)  — 무기 EXP 환산
//   estone:<id>   — 장비 강화석 (equipment.min.json id 1~4)  — 일반 장비 EXP (현재 미환산, 인벤토리 입력만)
//
// 부족 계산은 1.0배 단순 합산 (옵션 3). 무기 부품 1.5x 보너스는 학생 카드 라벨에만 노출.

import expData from '@/data/planner/exp_conversion.json';

export interface ExpItem {
  key: string;
  id: number;
  rarity: 'N' | 'R' | 'SR' | 'SSR';
  name: string;
  icon: string;
  exp: number;
}

export interface WeaponPartSeries {
  label: string;
  bonusWeaponTypes: string[]; // ["*"] 면 모든 무기 타입
  items: ExpItem[];
}

export type WeaponPartSeriesId = 'A' | 'B' | 'C' | 'Z';

interface ExpConversionData {
  studentReports: ExpItem[];
  weaponParts: Record<WeaponPartSeriesId, WeaponPartSeries>;
  equipmentStones: ExpItem[];
}

const data = expData as unknown as ExpConversionData;

export const STUDENT_REPORTS: readonly ExpItem[] = data.studentReports;
export const WEAPON_PART_SERIES: Readonly<Record<WeaponPartSeriesId, WeaponPartSeries>> = data.weaponParts;
export const EQUIPMENT_STONES: readonly ExpItem[] = data.equipmentStones;

/** 모든 EXP 아이템 평탄화 (key → ExpItem) */
export const EXP_ITEM_LOOKUP: ReadonlyMap<string, ExpItem> = (() => {
  const m = new Map<string, ExpItem>();
  for (const it of STUDENT_REPORTS) m.set(it.key, it);
  for (const series of Object.values(WEAPON_PART_SERIES)) {
    for (const it of series.items) m.set(it.key, it);
  }
  for (const it of EQUIPMENT_STONES) m.set(it.key, it);
  return m;
})();

/** 무기 부품만 평탄화 (무기 EXP 환산 합계 계산용 — 강화석은 장비용이라 제외) */
const ALL_WEAPON_PART_ITEMS: readonly ExpItem[] = Object.values(WEAPON_PART_SERIES).flatMap((s) => s.items);

/** 보유 인벤토리 → student_exp 합계 (보고서 등급별 ExpValue × 보유량 합산) */
export function aggregateStudentExp(inventory: Record<string, number>): number {
  let sum = 0;
  for (const it of STUDENT_REPORTS) {
    sum += (inventory[it.key] ?? 0) * it.exp;
  }
  return sum;
}

/** 보유 인벤토리 → weapon_exp 합계 (무기 부품만 1.0배 합산. 장비 강화석은 무기 EXP 가 아니므로 제외) */
export function aggregateWeaponExp(inventory: Record<string, number>): number {
  let sum = 0;
  for (const it of ALL_WEAPON_PART_ITEMS) {
    sum += (inventory[it.key] ?? 0) * it.exp;
  }
  return sum;
}

/**
 * deficit 계산용 — 인벤토리에 student_exp / weapon_exp 합계 키를 채워서 반환.
 * 기존 student_exp / weapon_exp 값(있을 경우, 레거시) 도 합산해 보존.
 * 원본 인벤토리는 변경하지 않음 (immutable).
 */
export function enrichInventoryWithSyntheticTotals(
  inventory: Record<string, number>,
): Record<string, number> {
  return {
    ...inventory,
    student_exp: (inventory.student_exp ?? 0) + aggregateStudentExp(inventory),
    weapon_exp: (inventory.weapon_exp ?? 0) + aggregateWeaponExp(inventory),
  };
}

/** 부족 EXP 를 등급별 수량으로 분해한 결과 1행 */
export interface BreakdownItem {
  source: ExpItem;
  count: number;
}

/**
 * 그리디 분해 — 큰 등급 → 작은 등급 순서로 floor 분배. 마지막 등급은 잔여를 ceil 으로 처리해
 * 표시 합계가 amount 보다 약간 over 될 수 있음 (게임 내 EXP 정확 매칭 어렵기 때문).
 */
function greedyBreakdown(amount: number, items: readonly ExpItem[]): BreakdownItem[] {
  if (amount <= 0) return [];
  const sorted = [...items].sort((a, b) => b.exp - a.exp);
  const out: BreakdownItem[] = [];
  let remaining = amount;
  for (let i = 0; i < sorted.length; i++) {
    const it = sorted[i];
    const isLast = i === sorted.length - 1;
    const count = isLast
      ? Math.ceil(Math.max(0, remaining) / it.exp)
      : Math.floor(remaining / it.exp);
    if (count > 0) out.push({ source: it, count });
    remaining -= count * it.exp;
  }
  return out;
}

/** 부족 학생 EXP 를 활동 보고서 등급별 수량으로 분해 */
export function breakdownStudentExp(amount: number): BreakdownItem[] {
  return greedyBreakdown(amount, STUDENT_REPORTS);
}

/**
 * 부족 무기 EXP 를 부품 등급별 수량으로 분해.
 * 4시리즈(스프링/해머/총열/공이)가 모두 동일 EXP 라 시리즈 무관.
 * 대표로 공이(Z) 시리즈 아이콘을 사용 — UI 라벨에 "(부품 등급별, 시리즈 무관)" 명시 권장.
 */
export function breakdownWeaponExpAsParts(amount: number): BreakdownItem[] {
  return greedyBreakdown(amount, WEAPON_PART_SERIES.Z.items);
}

/**
 * 학생 WeaponType 에 1.5배 보너스가 적용되는 부품 시리즈 ID 들을 반환.
 * 공이("*") 는 모든 무기 타입에 보너스 → 항상 포함.
 */
export function getBonusSeriesIdsFor(weaponType: string): WeaponPartSeriesId[] {
  const out: WeaponPartSeriesId[] = [];
  for (const [sid, series] of Object.entries(WEAPON_PART_SERIES) as [WeaponPartSeriesId, WeaponPartSeries][]) {
    if (series.bonusWeaponTypes.includes('*') || series.bonusWeaponTypes.includes(weaponType)) {
      out.push(sid);
    }
  }
  return out;
}
