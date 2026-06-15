// 인연랭크 (Bond) — 선물 권장 + 매칭 배수.
//
// SchaleDB 의 `ExpValue × min(matchingCount, 3) + 1` 공식 사용.
// 인연 EXP 누적 테이블은 ../tables/bondExp.

import type { SchaleDBItem, SchaleDBStudent } from '@/types/schaledb';
import type { BondRange, InventoryMap, RequiredMaterials } from '@/types/planner';
import { CUMULATIVE_BOND_EXP } from '../tables/bondExp';

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
