// 인연랭크 계산기 — 학생 1명 기준 필요 EXP / 선물 효율 / 도달 랭크 / 부족분 추천.
//
// 랭크 / EXP 표기:
//   - CUMULATIVE_BOND_EXP[rank] = 인연랭크 1 에서 `rank` 까지의 누적 EXP
//   - progress = 현재 랭크 구간 안에서 이미 쌓은 EXP (누적 아님). 0 ≤ progress < rankSpan(current)
//
// 선물 배수는 플래너와 같은 favorMultiplier (SchaleDB 공식) 를 쓴다.
// 획득 가능 여부 / 미출시 판정은 SchaleDB Global 지역 기준 (한섭 포함).

import type { SchaleDBItem, SchaleDBItemMap, SchaleDBStudent } from '@/types/schaledb';
import { SCHALEDB_REGION } from '@/lib/schaledb';
import { favorMultiplier } from '@/service/planner/utils/cultivationCalculator/bondGifts';
import { BOND_MAX_LEVEL, CUMULATIVE_BOND_EXP } from '@/service/planner/utils/tables/bondExp';

const REGION = SCHALEDB_REGION.Global;

export interface GiftRow {
  item: SchaleDBItem;
  mult: 1 | 2 | 3 | 4;
  expPerItem: number;
  /** 제조 · 상점 · 드랍 어디서도 얻을 수 없는 선물 (이벤트 한정) */
  limited: boolean;
}

/** 선물 선택 상자 + 이 학생 기준 최선의 교환 대상 (내용물이 없으면 null) */
export interface ChoiceBoxRow {
  box: SchaleDBItem;
  best: GiftRow | null;
}

export interface ReachResult {
  rank: number;
  /** 도달 랭크에서 다음 랭크까지 쌓인 EXP (최대 랭크면 초과분) */
  leftover: number;
}

export interface ShortfallSuggestion {
  /** 제조 가능 SSR 중 최고 효율 1종 — tiedCount 는 같은 효율의 다른 SSR 수 ("외 n종") */
  ssr: { gift: GiftRow; count: number; tiedCount: number } | null;
  /** 선물 선택 상자 — 개당 이 학생의 최고 효율 SR (via) 로 교환한다고 가정 */
  box: { box: SchaleDBItem; via: GiftRow; count: number } | null;
}

export function clampRank(rank: number): number {
  return Math.max(1, Math.min(BOND_MAX_LEVEL, Math.floor(rank)));
}

/** `current` → `current + 1` 구간 EXP (최대 랭크면 0) */
export function rankSpan(current: number): number {
  const c = clampRank(current);
  if (c >= BOND_MAX_LEVEL) return 0;
  return CUMULATIVE_BOND_EXP[c + 1] - CUMULATIVE_BOND_EXP[c];
}

/** progress 를 현재 랭크 구간 안 (0 ~ span - 1) 으로 보정 */
export function clampProgress(current: number, progress: number): number {
  const span = rankSpan(current);
  if (span === 0) return 0;
  return Math.max(0, Math.min(span - 1, Math.floor(progress)));
}

/** 현재 랭크 (+ 진행 EXP) → 목표 랭크 필요 EXP */
export function requiredBondExp(current: number, progress: number, target: number): number {
  const c = clampRank(current);
  const t = clampRank(target);
  if (t <= c) return 0;
  return Math.max(0, CUMULATIVE_BOND_EXP[t] - CUMULATIVE_BOND_EXP[c] - clampProgress(c, progress));
}

/** 현재 랭크 (+ 진행 EXP) 에 `exp` 를 더했을 때 도달하는 랭크 */
export function maxBondFromExp(current: number, progress: number, exp: number): ReachResult {
  const c = clampRank(current);
  const total = CUMULATIVE_BOND_EXP[c] + clampProgress(c, progress) + Math.max(0, exp);
  let rank = c;
  for (let r = c + 1; r <= BOND_MAX_LEVEL; r++) {
    if (CUMULATIVE_BOND_EXP[r] <= total) rank = r;
    else break;
  }
  return { rank, leftover: total - CUMULATIVE_BOND_EXP[rank] };
}

export function isLimitedGift(item: SchaleDBItem): boolean {
  return !(item.Craftable?.[REGION] || item.Shop?.[REGION] || item.StageDrop?.[REGION]);
}

function toRow(student: SchaleDBStudent, item: SchaleDBItem, commonTags: readonly string[]): GiftRow {
  const mult = favorMultiplier(student, item, commonTags);
  return { item, mult, expPerItem: (item.ExpValue ?? 0) * mult, limited: isLimitedGift(item) };
}

/** 배수 (반응 단계) 내림차순 → 개당 EXP 내림차순 → id 오름차순 */
function compareRows(a: GiftRow, b: GiftRow): number {
  if (a.mult !== b.mult) return b.mult - a.mult;
  if (a.expPerItem !== b.expPerItem) return b.expPerItem - a.expPerItem;
  return a.item.Id - b.item.Id;
}

/** 이 학생 기준 선물 효율표 */
export function buildGiftTable(
  student: SchaleDBStudent,
  favorItems: readonly SchaleDBItem[],
  commonTags: readonly string[],
): GiftRow[] {
  return favorItems
    .filter((it) => (it.ExpValue ?? 0) > 0)
    .map((it) => toRow(student, it, commonTags))
    .sort(compareRows);
}

/** 선물 선택 상자 → 내용물 중 이 학생 최고 효율 선물 */
export function choiceBoxValue(
  student: SchaleDBStudent,
  box: SchaleDBItem,
  items: SchaleDBItemMap,
  commonTags: readonly string[],
): ChoiceBoxRow {
  const rows = (box.Items ?? [])
    .filter((c) => c.Type === 'Item')
    .map((c) => items[String(c.Id)])
    .filter((it): it is SchaleDBItem => Boolean(it) && (it.ExpValue ?? 0) > 0)
    .map((it) => toRow(student, it, commonTags))
    .sort((a, b) => b.expPerItem - a.expPerItem || compareRows(a, b));
  return { box, best: rows[0] ?? null };
}

/** 보유 선물 + 상자 환산 EXP 합계. counts 는 아이템 id → 수량 */
export function holdingsExp(
  gifts: readonly GiftRow[],
  boxes: readonly ChoiceBoxRow[],
  counts: Readonly<Record<string, number>>,
): number {
  let sum = 0;
  for (const g of gifts) sum += (counts[String(g.item.Id)] ?? 0) * g.expPerItem;
  for (const b of boxes) {
    if (b.best) sum += (counts[String(b.box.Id)] ?? 0) * b.best.expPerItem;
  }
  return sum;
}

/**
 * 부족 EXP 를 채우는 두 가지 대안 (혼합 최적화 없음).
 *   - SSR: 제조 가능 SSR 중 최고 효율 1종의 개수. 동점끼리는 개당 EXP 가 같아 개수도 같다.
 *   - 상자: 선물 선택 상자를 이 학생 최고 효율 SR 로 교환한다고 가정한 개수.
 * 한정 선물은 두 경로 모두에서 빠진다 (SSR 은 제조 가능 필터, 상자 내용물엔 한정 없음).
 */
export function suggestShortfall(
  remainingExp: number,
  gifts: readonly GiftRow[],
  boxes: readonly ChoiceBoxRow[],
): ShortfallSuggestion {
  if (remainingExp <= 0) return { ssr: null, box: null };

  let ssr: ShortfallSuggestion['ssr'] = null;
  const candidates = gifts.filter((g) => g.item.Rarity === 'SSR' && !g.limited && g.expPerItem > 0);
  if (candidates.length > 0) {
    const best = candidates.reduce((a, b) => (b.expPerItem > a.expPerItem ? b : a));
    const tiedCount = candidates.filter((g) => g !== best && g.expPerItem === best.expPerItem).length;
    ssr = { gift: best, count: Math.ceil(remainingExp / best.expPerItem), tiedCount };
  }

  let box: ShortfallSuggestion['box'] = null;
  const usable = boxes.find((b) => b.best && b.best.expPerItem > 0);
  if (usable?.best) {
    box = { box: usable.box, via: usable.best, count: Math.ceil(remainingExp / usable.best.expPerItem) };
  }

  return { ssr, box };
}
