// 오프라인 모임 회계 — 순수 계산 함수 (PLAN_meetup_ledger.md §2.3, §3)
//
// 모든 금액은 정수(원). 부호 규칙: balance > 0 = 받을 돈, < 0 = 보낼 돈.
// 총무(participant)와 모임 통장(TREASURY)은 송금 목록에서 한 노드로 합친다.

import {
  TREASURY,
  type MeetupExpense,
  type MeetupExpenseCategory,
  type MeetupLedgerData,
  type MeetupParticipant,
  type MeetupPeriod,
  type MeetupPublicSnapshot,
  type MeetupSummary,
  type MeetupTransferMode,
  type SettlementTransfer,
} from '@/types/meetup';

export const CATEGORY_LABELS: Record<MeetupExpenseCategory, string> = {
  venue: '대관',
  food: '식음료',
  goods: '경품·굿즈',
  transport: '교통',
  etc: '기타',
};

export const EXPENSE_CATEGORIES = Object.keys(CATEGORY_LABELS) as MeetupExpenseCategory[];

// ── 정규화 ─────────────────────────────────────────────────

export function emptyLedgerData(): MeetupLedgerData {
  return {
    version: 1,
    treasurerId: null,
    feeTiers: [],
    participants: [],
    expenses: [],
    surplusMode: 'carry',
    deficitMode: 'collect',
    transferMode: 'hub',
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fb = ''): string => (typeof v === 'string' ? v : fb);
const int = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : 0);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const oneOf = <T extends string>(v: unknown, options: readonly T[], fb: T): T =>
  options.includes(v as T) ? (v as T) : fb;
const dateOrNull = (v: unknown): string | null =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;

/** DB 의 jsonb `data` (새 행은 `{}`) → 빠진 필드를 기본값으로 채운 장부 */
export function normalizeLedgerData(raw: unknown): MeetupLedgerData {
  const base = emptyLedgerData();
  if (!isObj(raw)) return base;

  const feeTiers = arr(raw.feeTiers).filter(isObj).map((t) => ({
    id: str(t.id),
    label: str(t.label),
    amount: int(t.amount),
  }));
  const participants: MeetupParticipant[] = arr(raw.participants).filter(isObj).map((p) => ({
    id: str(p.id),
    userId: typeof p.userId === 'string' ? p.userId : null,
    name: str(p.name),
    feeTierId: typeof p.feeTierId === 'string' ? p.feeTierId : null,
    feePaid: p.feePaid === true,
    settledAmount: typeof p.settledAmount === 'number' && Number.isFinite(p.settledAmount) ? Math.trunc(p.settledAmount) : null,
    attendFrom: dateOrNull(p.attendFrom),
    attendTo: dateOrNull(p.attendTo),
    memo: str(p.memo),
  }));
  const expenses: MeetupExpense[] = arr(raw.expenses).filter(isObj).map((e) => {
    const kind = isObj(e.cover) ? e.cover.kind : undefined;
    const cover: MeetupExpense['cover'] = kind === 'split' && isObj(e.cover)
      ? { kind: 'split', among: arr(e.cover.among).filter((x): x is string => typeof x === 'string') }
      : kind === 'present'
        ? { kind: 'present' }
        : { kind: 'fee' };
    return {
      id: str(e.id),
      label: str(e.label),
      category: oneOf(e.category, EXPENSE_CATEGORIES, 'etc'),
      amount: int(e.amount),
      date: dateOrNull(e.date),
      paidBy: str(e.paidBy, TREASURY),
      cover,
      memo: str(e.memo),
    };
  });

  return {
    version: 1,
    treasurerId: typeof raw.treasurerId === 'string' ? raw.treasurerId : null,
    feeTiers,
    participants,
    expenses,
    surplusMode: oneOf(raw.surplusMode, ['carry', 'refund'] as const, base.surplusMode),
    deficitMode: oneOf(raw.deficitMode, ['collect', 'absorb'] as const, base.deficitMode),
    transferMode: oneOf(raw.transferMode, ['hub', 'min'] as const, base.transferMode),
  };
}

// ── 조회 헬퍼 ───────────────────────────────────────────────

export function feeOf(data: MeetupLedgerData, p: MeetupParticipant): number {
  if (!p.feeTierId) return 0;
  return data.feeTiers.find((t) => t.id === p.feeTierId)?.amount ?? 0;
}

// ── 참석 기간 · 그날 참석자 ─────────────────────────────────

export const NO_PERIOD: MeetupPeriod = { start: null, end: null };

/** 여러 날 모임인지 — 참석 기간 · 지출 날짜는 이때만 의미가 있다 (하루짜리면 전원 참석으로 취급) */
export function isMultiDay(period: MeetupPeriod): boolean {
  return !!period.start && !!period.end && period.end > period.start;
}

/** 참가자의 실제 참석 구간 [from, to] (비어 있으면 모임 기간 전체). 하루짜리 모임이면 null */
export function attendWindow(p: MeetupParticipant, period: MeetupPeriod): { from: string; to: string } | null {
  if (!isMultiDay(period)) return null;
  return { from: p.attendFrom ?? (period.start as string), to: p.attendTo ?? (period.end as string) };
}

/** 지출 날짜 (비어 있으면 모임 시작일) */
export function expenseDate(e: MeetupExpense, period: MeetupPeriod): string | null {
  return e.date ?? period.start;
}

/** 해당 날짜에 참석한 참가자 id (목록 순서). 하루짜리 모임이면 전원 */
export function presentOn(data: MeetupLedgerData, period: MeetupPeriod, date: string | null): string[] {
  if (!isMultiDay(period) || !date) return data.participants.map((p) => p.id);
  return data.participants
    .filter((p) => {
      const w = attendWindow(p, period) as { from: string; to: string };
      return w.from <= date && date <= w.to;
    })
    .map((p) => p.id);
}

/** 지출을 나눠 낼 참가자 id — fee 는 빈 배열 (회비에서 충당) */
export function expenseSharers(data: MeetupLedgerData, period: MeetupPeriod, e: MeetupExpense): string[] {
  if (e.cover.kind === 'fee') return [];
  if (e.cover.kind === 'present') return presentOn(data, period, expenseDate(e, period));
  const pIds = new Set(data.participants.map((p) => p.id));
  return e.cover.among.filter((id) => pIds.has(id));
}

/** 표시용 참석 기간 — 전체 기간 참석이면 null */
export function attendLabel(p: MeetupParticipant, period: MeetupPeriod): string | null {
  const w = attendWindow(p, period);
  if (!w || (w.from === period.start && w.to === period.end)) return null;
  const md = (d: string) => d.slice(5);
  return w.from === w.to ? `${md(w.from)}만` : `${md(w.from)} ~ ${md(w.to)}`;
}

/** 모임 통장(총무)이 관여하는 장부인지 — 참가비 / 통장 결제 / 회비 충당 지출 중 하나라도 있으면 총무 필수 */
export function needsTreasurer(data: MeetupLedgerData): boolean {
  return (
    data.participants.some((p) => feeOf(data, p) > 0)
    || data.expenses.some((e) => e.paidBy === TREASURY || e.cover.kind === 'fee')
  );
}

/** 실제 적용되는 송금 방식 — 총무가 없으면 `min` 고정 */
export function effectiveTransferMode(data: MeetupLedgerData): MeetupTransferMode {
  return data.treasurerId ? data.transferMode : 'min';
}

// ── 검증 (§3.0) ─────────────────────────────────────────────

export interface LedgerIssue {
  message: string;
  /** 오류 표시할 행 */
  target?: { kind: 'participant' | 'expense' | 'feeTier' | 'treasurer'; id?: string };
}

/**
 * @param treasurerUserIds 편집 권한 총무들 — 비어 있지 않으면 정산 총무(◉)는 이 중 한 명이어야 한다
 */
export function validateLedger(
  data: MeetupLedgerData,
  period: MeetupPeriod = NO_PERIOD,
  treasurerUserIds: string[] = [],
): LedgerIssue[] {
  const issues: LedgerIssue[] = [];
  const multiDay = isMultiDay(period);
  const inPeriod = (d: string) => multiDay && (period.start as string) <= d && d <= (period.end as string);
  const pIds = new Set(data.participants.map((p) => p.id));
  const tierIds = new Set(data.feeTiers.map((t) => t.id));

  data.feeTiers.forEach((t, i) => {
    if (!t.label.trim()) issues.push({ message: `참가비 구간 ${i + 1}번의 이름이 비어 있습니다.`, target: { kind: 'feeTier', id: t.id } });
  });

  const seen = new Map<string, string>();
  const seenUsers = new Set<string>();
  data.participants.forEach((p, i) => {
    const name = p.name.trim();
    if (p.userId) {
      if (seenUsers.has(p.userId)) {
        issues.push({ message: `${name || `참가자 ${i + 1}번`}: 같은 회원이 두 번 추가되었습니다.`, target: { kind: 'participant', id: p.id } });
      }
      seenUsers.add(p.userId);
    }
    if (!name) {
      issues.push({ message: `참가자 ${i + 1}번의 닉네임이 비어 있습니다.`, target: { kind: 'participant', id: p.id } });
      return;
    }
    if (seen.has(name)) {
      issues.push({ message: `닉네임 "${name}" 이(가) 중복됩니다.`, target: { kind: 'participant', id: p.id } });
    }
    seen.set(name, p.id);
    if (p.feeTierId && !tierIds.has(p.feeTierId)) {
      issues.push({ message: `${name}: 참가비 구간이 삭제되었습니다. 다시 선택하세요.`, target: { kind: 'participant', id: p.id } });
    }
    if (multiDay) {
      if ((p.attendFrom && !inPeriod(p.attendFrom)) || (p.attendTo && !inPeriod(p.attendTo))) {
        issues.push({ message: `${name}: 참석 기간이 모임 기간 밖입니다.`, target: { kind: 'participant', id: p.id } });
      } else {
        const w = attendWindow(p, period) as { from: string; to: string };
        if (w.from > w.to) issues.push({ message: `${name}: 참석 끝일이 참석 시작일보다 빠릅니다.`, target: { kind: 'participant', id: p.id } });
      }
    }
  });

  data.expenses.forEach((e, i) => {
    const name = e.label.trim() || `지출 ${i + 1}번`;
    if (!e.label.trim()) issues.push({ message: `지출 ${i + 1}번의 항목명이 비어 있습니다.`, target: { kind: 'expense', id: e.id } });
    if (!(e.amount > 0)) issues.push({ message: `${name}: 금액을 입력하세요.`, target: { kind: 'expense', id: e.id } });
    if (e.paidBy !== TREASURY && !pIds.has(e.paidBy)) {
      issues.push({ message: `${name}: 결제자가 삭제되었습니다. 다시 선택하세요.`, target: { kind: 'expense', id: e.id } });
    }
    if (multiDay && e.date && !inPeriod(e.date)) {
      issues.push({ message: `${name}: 사용 날짜가 모임 기간 밖입니다.`, target: { kind: 'expense', id: e.id } });
    } else if (e.cover.kind === 'present' && expenseSharers(data, period, e).length === 0) {
      issues.push({
        message: multiDay ? `${name}: 그날 참석한 참가자가 없습니다.` : `${name}: 분담할 참가자가 없습니다.`,
        target: { kind: 'expense', id: e.id },
      });
    }
    if (e.cover.kind === 'split') {
      const valid = e.cover.among.filter((id) => pIds.has(id));
      if (valid.length === 0) {
        issues.push({ message: `${name}: 분담할 참가자를 1명 이상 선택하세요.`, target: { kind: 'expense', id: e.id } });
      } else if (valid.length !== e.cover.among.length) {
        issues.push({ message: `${name}: 분담 대상에 삭제된 참가자가 있습니다.`, target: { kind: 'expense', id: e.id } });
      }
    }
  });

  const settleTreasurer = data.participants.find((p) => p.id === data.treasurerId);
  if (data.treasurerId && !settleTreasurer) {
    issues.push({ message: '총무로 지정된 참가자가 삭제되었습니다. 다시 지정하세요.', target: { kind: 'treasurer' } });
  } else if (settleTreasurer && treasurerUserIds.length > 0 && !treasurerUserIds.includes(settleTreasurer.userId ?? '')) {
    issues.push({ message: '정산 총무(송금 받는 사람)는 총무 중 한 명이어야 합니다.', target: { kind: 'treasurer' } });
  } else if (!data.treasurerId && needsTreasurer(data)) {
    issues.push({
      message: '참가비 · 모임 통장 결제 · 회비 충당 지출이 있으면 총무를 지정해야 합니다.',
      target: { kind: 'treasurer' },
    });
  }

  return issues;
}

// ── 분배 (§3.1, §3.2) ───────────────────────────────────────

/** 균등 분배. 나머지 원은 목록 앞쪽부터 1원씩. 합계 = amount */
export function splitEven(amount: number, ids: string[]): Map<string, number> {
  const out = new Map<string, number>();
  const n = ids.length;
  if (n === 0) return out;
  const base = Math.floor(amount / n);
  const rest = amount - base * n;
  ids.forEach((id, k) => out.set(id, base + (k < rest ? 1 : 0)));
  return out;
}

/** 비례 분배 (최대 잔여 방식). 동점은 목록 순서. 가중치 합 0 이면 균등 분배. 합계 = amount */
export function splitProportional(amount: number, ids: string[], weights: number[]): Map<string, number> {
  const sw = weights.reduce((s, w) => s + w, 0);
  if (sw <= 0) return splitEven(amount, ids);
  const rows = ids.map((id, k) => ({
    id,
    k,
    q: Math.floor((amount * weights[k]) / sw),
    r: (amount * weights[k]) % sw,
  }));
  let left = amount - rows.reduce((s, x) => s + x.q, 0);
  [...rows]
    .sort((a, b) => b.r - a.r || a.k - b.k)
    .forEach((x) => {
      if (left > 0) {
        x.q += 1;
        left -= 1;
      }
    });
  return new Map(rows.map((x) => [x.id, x.q]));
}

// ── 정산 (§3.3, §3.4) ───────────────────────────────────────

export interface ParticipantBalance {
  id: string;
  name: string;
  tierLabel: string | null;
  fee: number;
  /** 분담 지출 몫 합계 */
  splitShare: number;
  /** 환급(−) / 추가 징수(+) */
  adjustment: number;
  /** 부담해야 할 돈 */
  owed: number;
  /** 이미 낸 돈 (선납 참가비 + 직접 결제한 지출) */
  paid: number;
  /** paid − owed */
  balance: number;
  isTreasurer: boolean;
  settled: boolean;
  /** 정산 완료 후 생긴 차액 (hub 모드 + 완료자만, 그 외 0) */
  diff: number;
}

export interface SettlementResult {
  summary: MeetupSummary;
  rows: ParticipantBalance[];
  /** 모임 통장의 순잔액 b_T = R − C */
  treasuryBalance: number;
  /** 지금 통장에 있는 돈 C */
  treasuryCash: number;
  transferMode: MeetupTransferMode;
  transfers: SettlementTransfer[];
  /** 불변식 Σb_i + b_T = 0 */
  balanced: boolean;
  /** min 모드인데 정산 완료 기록이 남아 있는 사람이 있음 (기록은 무시됨) */
  ignoredSettled: boolean;
}

export function computeSettlement(data: MeetupLedgerData, period: MeetupPeriod = NO_PERIOD): SettlementResult {
  const ps = data.participants;
  const ids = ps.map((p) => p.id);
  const fees = ps.map((p) => feeOf(data, p));
  const tierLabel = (p: MeetupParticipant) => data.feeTiers.find((t) => t.id === p.feeTierId)?.label ?? null;

  const totalFee = fees.reduce((s, f) => s + f, 0);
  const paidFee = ps.reduce((s, p, k) => s + (p.feePaid ? fees[k] : 0), 0);
  const totalExpense = data.expenses.reduce((s, e) => s + e.amount, 0);
  const feeCovered = data.expenses.filter((e) => e.cover.kind === 'fee').reduce((s, e) => s + e.amount, 0);
  const splitTotal = totalExpense - feeCovered;
  const r0 = totalFee - feeCovered;

  // 회비 잔액 처리 (§3.3)
  let adjust = new Map<string, number>();
  let finalBalance = r0;
  if (r0 > 0 && data.surplusMode === 'refund' && ids.length > 0) {
    adjust = new Map([...splitProportional(r0, ids, fees)].map(([id, v]) => [id, -v]));
    finalBalance = 0;
  } else if (r0 < 0 && data.deficitMode === 'collect' && ids.length > 0) {
    adjust = splitProportional(-r0, ids, fees);
    finalBalance = 0;
  }

  // 분담 몫
  const share = new Map<string, number>();
  for (const e of data.expenses) {
    for (const [id, v] of splitEven(e.amount, expenseSharers(data, period, e))) share.set(id, (share.get(id) ?? 0) + v);
  }
  const paidExpense = new Map<string, number>();
  for (const e of data.expenses) {
    if (e.paidBy !== TREASURY) paidExpense.set(e.paidBy, (paidExpense.get(e.paidBy) ?? 0) + e.amount);
  }

  const mode = effectiveTransferMode(data);
  const rows: ParticipantBalance[] = ps.map((p, k) => {
    const splitShare = share.get(p.id) ?? 0;
    const adjustment = adjust.get(p.id) ?? 0;
    const owed = fees[k] + splitShare + adjustment;
    const paid = (p.feePaid ? fees[k] : 0) + (paidExpense.get(p.id) ?? 0);
    const balance = paid - owed;
    const isTreasurer = p.id === data.treasurerId;
    const settled = p.settledAmount !== null && !isTreasurer;
    return {
      id: p.id,
      name: p.name.trim(),
      tierLabel: tierLabel(p),
      fee: fees[k],
      splitShare,
      adjustment,
      owed,
      paid,
      balance,
      isTreasurer,
      settled,
      diff: settled && mode === 'hub' ? balance - (p.settledAmount as number) : 0,
    };
  });

  const treasuryCash = paidFee - data.expenses.filter((e) => e.paidBy === TREASURY).reduce((s, e) => s + e.amount, 0);
  const treasuryBalance = finalBalance - treasuryCash;
  const balanced = rows.reduce((s, r) => s + r.balance, 0) + treasuryBalance === 0;

  const transfers = mode === 'hub' ? hubTransfers(rows) : minTransfers(rows, treasuryBalance, !!data.treasurerId);

  return {
    summary: {
      totalFee,
      paidFee,
      totalExpense,
      feeCovered,
      splitTotal,
      r0,
      surplusMode: data.surplusMode,
      deficitMode: data.deficitMode,
      finalBalance,
    },
    rows,
    treasuryBalance,
    treasuryCash,
    transferMode: mode,
    transfers,
    balanced,
    ignoredSettled: mode === 'min' && rows.some((r) => r.settled),
  };
}

/** 총무 경유 — 총무 외 각자 총무와만 주고받음. 정산 완료자는 차액만 */
function hubTransfers(rows: ParticipantBalance[]): SettlementTransfer[] {
  const out: SettlementTransfer[] = [];
  for (const r of rows) {
    if (r.isTreasurer) continue;
    const v = r.settled ? r.diff : r.balance;
    if (v < 0) out.push({ from: r.id, to: TREASURY, amount: -v });
    else if (v > 0) out.push({ from: TREASURY, to: r.id, amount: v });
  }
  return out;
}

/** 송금 건수 줄이기 — 금액 큰 순 그리디 매칭. 정산 완료 기록은 반영하지 않음 */
function minTransfers(rows: ParticipantBalance[], treasuryBalance: number, hasTreasurer: boolean): SettlementTransfer[] {
  // 노드 순서 = 동점 우선순위: 통장(총무) → 참가자 목록 순
  const nodes: { key: string; v: number }[] = [];
  if (hasTreasurer) {
    const treasurerBalance = rows.find((r) => r.isTreasurer)?.balance ?? 0;
    nodes.push({ key: TREASURY, v: treasuryBalance + treasurerBalance });
  }
  for (const r of rows) if (!r.isTreasurer) nodes.push({ key: r.id, v: r.balance });
  const order = new Map(nodes.map((n, k) => [n.key, k]));

  const cred = nodes.filter((n) => n.v > 0).map((n) => ({ ...n }));
  const debt = nodes.filter((n) => n.v < 0).map((n) => ({ key: n.key, v: -n.v }));
  const byAmount = (a: { key: string; v: number }, b: { key: string; v: number }) =>
    b.v - a.v || (order.get(a.key) as number) - (order.get(b.key) as number);

  const out: SettlementTransfer[] = [];
  while (cred.length && debt.length) {
    cred.sort(byAmount);
    debt.sort(byAmount);
    const c = cred[0];
    const d = debt[0];
    const m = Math.min(c.v, d.v);
    out.push({ from: d.key, to: c.key, amount: m });
    c.v -= m;
    d.v -= m;
    if (c.v === 0) cred.shift();
    if (d.v === 0) debt.shift();
  }
  return out;
}

// ── 표시 · 공개 (§3.5, §5.2) ────────────────────────────────

/** 송금 노드 표시 이름 */
export function nodeName(data: MeetupLedgerData, key: string): string {
  if (key === TREASURY) {
    const t = data.participants.find((p) => p.id === data.treasurerId);
    return t ? `총무 ${t.name.trim()}` : '모임 통장';
  }
  return data.participants.find((p) => p.id === key)?.name.trim() ?? '(삭제됨)';
}

export function coverLabel(data: MeetupLedgerData, period: MeetupPeriod, e: MeetupExpense): string {
  if (e.cover.kind === 'fee') return '회비';
  const n = expenseSharers(data, period, e).length;
  if (e.cover.kind === 'present') return isMultiDay(period) ? `그날 참석자 분담 (${n}명)` : `전원 분담 (${n}명)`;
  return n === data.participants.length ? `전원 분담 (${n}명)` : `${n}명 분담`;
}

export function buildPublicSnapshot(
  data: MeetupLedgerData,
  result: SettlementResult,
  period: MeetupPeriod = NO_PERIOD,
): MeetupPublicSnapshot {
  const treasurer = data.participants.find((p) => p.id === data.treasurerId);
  const multiDay = isMultiDay(period);
  // 날짜순 (같은 날은 입력 순서 유지 — sort 는 안정 정렬)
  const expenses = multiDay
    ? [...data.expenses].sort((a, b) => (expenseDate(a, period) ?? '').localeCompare(expenseDate(b, period) ?? ''))
    : data.expenses;
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    treasurerName: treasurer ? treasurer.name.trim() : null,
    transferMode: result.transferMode,
    summary: result.summary,
    expenses: expenses.map((e) => ({
      date: multiDay ? expenseDate(e, period) : null,
      label: e.label.trim(),
      category: e.category,
      amount: e.amount,
      payerName: e.paidBy === TREASURY ? '모임 통장' : nodeName(data, e.paidBy),
      coverLabel: coverLabel(data, period, e),
    })),
    participants: result.rows.map((r, k) => ({
      name: r.name,
      tierLabel: r.tierLabel,
      attendLabel: attendLabel(data.participants[k], period),
      owed: r.owed,
      paid: r.paid,
      balance: r.balance,
      feePaid: data.participants.find((p) => p.id === r.id)?.feePaid ?? false,
      isTreasurer: r.isTreasurer,
      settled: r.settled && result.transferMode === 'hub',
      diff: r.diff,
    })),
    transfers: result.transfers.map((t) => ({
      from: nodeName(data, t.from),
      to: nodeName(data, t.to),
      amount: t.amount,
    })),
  };
}

export const won = (n: number): string => `${n.toLocaleString('ko-KR')}원`;

// ── 모임 기간 ──────────────────────────────────────────────

/** 입력값 → 저장값. 끝일이 비었거나 시작일과 같으면 null (하루짜리) */
export function normalizePeriod(start: string, end: string): { meetupDate: string | null; meetupEndDate: string | null } {
  const s = start || null;
  const e = end && end !== start ? end : null;
  return { meetupDate: s, meetupEndDate: e };
}

/** 기간 입력 오류 (없으면 null) — DB check 제약과 같은 규칙 */
export function periodError(start: string, end: string): string | null {
  if (end && !start) return '시작일을 먼저 입력하세요.';
  if (start && end && end < start) return '끝일이 시작일보다 빠릅니다.';
  return null;
}

/** "2026-10-12" / "2026-10-12 ~ 10-13" / "2026-12-31 ~ 2027-01-01" */
export function formatPeriod(start: string | null, end: string | null): string {
  if (!start) return '날짜 미정';
  if (!end || end === start) return start;
  return `${start} ~ ${end.slice(0, 4) === start.slice(0, 4) ? end.slice(5) : end}`;
}

/** 정산 문구 머리용 짧은 표기: "10/12" / "10/12~10/13" */
function shortPeriod(start: string | null, end: string | null): string {
  if (!start) return '';
  const md = (d: string) => d.slice(5).replace('-', '/');
  return !end || end === start ? md(start) : `${md(start)}~${md(end)}`;
}

export function surplusText(summary: MeetupSummary): string {
  const { r0, surplusMode, deficitMode } = summary;
  if (r0 > 0) return surplusMode === 'refund' ? `잔액 ${won(r0)} 환급` : `잔액 ${won(r0)} 이월`;
  if (r0 < 0) return deficitMode === 'collect' ? `부족 ${won(-r0)} 추가 징수` : `부족 ${won(-r0)} 총무 부담`;
  return '잔액 0원';
}

/** 카톡 / 디스코드 붙여넣기용 정산 문구. account 는 저장하지 않는 입력값 */
export function buildShareText(
  title: string,
  meetupDate: string | null,
  meetupEndDate: string | null,
  data: MeetupLedgerData,
  result: SettlementResult,
  account: string,
): string {
  const lines: string[] = [];
  const period = shortPeriod(meetupDate, meetupEndDate);
  const date = period ? `${period} ` : '';
  lines.push(`[${date}${title.trim()} 정산]`);
  const s = result.summary;
  const parts: string[] = [];
  if (s.totalFee > 0) parts.push(`총 참가비 ${s.totalFee.toLocaleString('ko-KR')}`);
  parts.push(`총지출 ${s.totalExpense.toLocaleString('ko-KR')}`);
  if (s.totalFee > 0 || s.feeCovered > 0) parts.push(surplusText(s));
  lines.push(parts.join(' / '));
  lines.push('');

  if (result.transfers.length === 0) {
    lines.push('송금할 내역이 없습니다.');
  } else {
    const treasurer = data.participants.find((p) => p.id === data.treasurerId);
    const head = treasurer && result.transferMode === 'hub'
      ? `송금 (→ 총무 ${treasurer.name.trim()}${account.trim() ? `, ${account.trim()}` : ''})`
      : `송금${account.trim() ? ` (${account.trim()})` : ''}`;
    lines.push(head);
    for (const t of result.transfers) {
      lines.push(`· ${nodeName(data, t.from)} → ${nodeName(data, t.to)} ${t.amount.toLocaleString('ko-KR')}`);
    }
  }
  return lines.join('\n');
}
