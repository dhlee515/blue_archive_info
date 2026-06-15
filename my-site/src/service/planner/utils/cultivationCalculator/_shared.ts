// cultivationCalculator 내부 공통 helper — 모든 domain 이 사용.

import type { SchaleDBEquipment } from '@/types/schaledb';
import type { RequiredMaterials } from '@/types/planner';

/** 일반 장비 id → 장비 데이터 맵 (equipment.min.json 은 Record 형태) */
export type EquipmentMap = Record<string, SchaleDBEquipment>;

/** RequiredMaterials 에 수량을 더하는 헬퍼 */
export function addTo(out: RequiredMaterials, key: string, qty: number): void {
  if (qty <= 0) return;
  out[key] = (out[key] ?? 0) + qty;
}

/** 두 RequiredMaterials 를 병합 (a 에 b 를 더함) */
export function mergeInto(a: RequiredMaterials, b: RequiredMaterials): void {
  for (const [key, qty] of Object.entries(b)) {
    addTo(a, key, qty);
  }
}

/**
 * SchaleDB 의 SkillMaterial / SkillExMaterial row (id 배열) 와 amount row 를 합쳐
 * out 에 누적합니다. row 가 누락되면 무시.
 */
export function addMaterialRow(
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
