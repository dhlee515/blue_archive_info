// 오프라인 모임 회계 — 순수 계산 함수 (PLAN_meetup_ledger.md §3, §10)
//
// 모든 금액은 정수(원). 부호 규칙: balance > 0 = 받을 돈, < 0 = 보낼 돈.
// 참가자 i: 낸 돈 = 선입금 + 직접 결제한 지출, 부담 = 참석한 이벤트 몫의 합, balance = 낸 돈 − 부담.
// 모임 통장(TREASURY, 총무가 보관): 현금 C = 선입금 합계 − 통장 결제. 정산이 끝나면 0 이 되어야 하므로 b_T = −C.
// 불변식 Σb_i + b_T = 0 (모든 지출이 참석자에게 빠짐없이 나눠지므로).
// 총무(participant)와 모임 통장은 송금 목록에서 한 노드로 합친다.

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
    version: 2,
    treasurerId: null,
    participants: [],
    expenses: [],
    transferMode: 'hub',
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fb = ''): string => (typeof v === 'string' ? v : fb);
const int = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : 0);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strs = (v: unknown): string[] => arr(v).filter((x): x is string => typeof x === 'string');
const oneOf = <T extends string>(v: unknown, options: readonly T[], fb: T): T =>
  options.includes(v as T) ? (v as T) : fb;
const dateOrNull = (v: unknown): string | null =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;

/**
 * DB 의 jsonb `data` (새 행은 `{}`) → 빠진 필드를 기본값으로 채운 장부.
 * 이전 형식은 여기서 바꾼다 (다음 저장 때 새 형식으로 기록) — `period` 는 그 변환에만 쓴다:
 * - 참가비 구간 + 선납 체크 → 선입금 (선납한 사람만 그 구간 금액, 미납은 0)
 * - 회비에서 충당 (fee) → 전원 분담
 * - 직접 선택 (split) → 고르지 않은 사람 불참
 * - 그날 참석자 (present) → 지출 날짜에 참석 기간 밖인 사람 불참 (하루짜리 모임이면 전원 참석)
 * - cover.event.absent → absent
 */
export function normalizeLedgerData(raw: unknown, period: MeetupPeriod = { start: null, end: null }): MeetupLedgerData {
  const base = emptyLedgerData();
  if (!isObj(raw)) return base;

  const tierAmount = new Map(
    arr(raw.feeTiers).filter(isObj).map((t) => [str(t.id), int(t.amount)] as const),
  );
  const rawParticipants = arr(raw.participants).filter(isObj);
  const participants: MeetupParticipant[] = rawParticipants.map((p) => ({
    id: str(p.id),
    userId: typeof p.userId === 'string' ? p.userId : null,
    name: str(p.name),
    prepaid: 'prepaid' in p
      ? int(p.prepaid)
      : p.feePaid === true && typeof p.feeTierId === 'string' ? (tierAmount.get(p.feeTierId) ?? 0) : 0,
    settledAmount: typeof p.settledAmount === 'number' && Number.isFinite(p.settledAmount) ? Math.trunc(p.settledAmount) : null,
    memo: str(p.memo),
  }));
  const pIds = participants.map((p) => p.id);
  const multiDay = !!period.start && !!period.end && period.end > period.start;

  /** 이전 형식의 cover → 불참자 목록 */
  const legacyAbsent = (e: Record<string, unknown>): string[] => {
    const c = isObj(e.cover) ? e.cover : {};
    if (c.kind === 'event') return strs(c.absent);
    if (c.kind === 'split') {
      const among = new Set(strs(c.among));
      return pIds.filter((id) => !among.has(id));
    }
    if (c.kind === 'present') {
      const date = dateOrNull(e.date) ?? period.start;
      if (!multiDay || !date) return [];
      return rawParticipants
        .filter((p) => {
          const from = dateOrNull(p.attendFrom) ?? (period.start as string);
          const to = dateOrNull(p.attendTo) ?? (period.end as string);
          return date < from || to < date;
        })
        .map((p) => str(p.id));
    }
    return []; // fee (회비에서) 또는 없음 → 전원 분담
  };

  const expenses: MeetupExpense[] = arr(raw.expenses).filter(isObj).map((e) => {
    const absent = new Set(Array.isArray(e.absent) ? strs(e.absent) : legacyAbsent(e));
    return {
      id: str(e.id),
      label: str(e.label),
      category: oneOf(e.category, EXPENSE_CATEGORIES, 'etc'),
      amount: int(e.amount),
      paidBy: str(e.paidBy, TREASURY),
      // 없는 참가자 id 정리 + 참가자 목록 순서
      absent: pIds.filter((id) => absent.has(id)),
      memo: str(e.memo),
    };
  });

  return {
    version: 2,
    treasurerId: typeof raw.treasurerId === 'string' ? raw.treasurerId : null,
    participants,
    expenses,
    transferMode: oneOf(raw.transferMode, ['hub', 'min'] as const, base.transferMode),
  };
}

// ── 조회 헬퍼 ───────────────────────────────────────────────

/** 지출(이벤트)을 나눠 낼 참가자 id — 불참자를 뺀 전원 (목록 순서) */
export function expenseSharers(data: MeetupLedgerData, e: MeetupExpense): string[] {
  const absent = new Set(e.absent);
  return data.participants.filter((p) => !absent.has(p.id)).map((p) => p.id);
}

/** 이 참가자가 빠진 이벤트 이름 (입력 순서) */
export function absentEventsOf(data: MeetupLedgerData, pid: string): string[] {
  return data.expenses
    .map((e, k) => ({ e, k }))
    .filter(({ e }) => e.absent.includes(pid))
    .map(({ e, k }) => e.label.trim() || `지출 ${k + 1}번`);
}

/** 이벤트 참석 ↔ 불참 토글 (불참자 목록은 참가자 목록 순서 유지) */
export function toggleAbsent(data: MeetupLedgerData, e: MeetupExpense, pid: string): MeetupExpense {
  const absent = new Set(e.absent);
  if (absent.has(pid)) absent.delete(pid);
  else absent.add(pid);
  return { ...e, absent: data.participants.map((p) => p.id).filter((id) => absent.has(id)) };
}

/** 모임 통장(총무)이 관여하는 장부인지 — 선입금 / 통장 결제가 하나라도 있으면 정산 총무 필수 */
export function needsTreasurer(data: MeetupLedgerData): boolean {
  return data.participants.some((p) => p.prepaid > 0) || data.expenses.some((e) => e.paidBy === TREASURY);
}

/** 실제 적용되는 송금 방식 — 총무가 없으면 `min` 고정 */
export function effectiveTransferMode(data: MeetupLedgerData): MeetupTransferMode {
  return data.treasurerId ? data.transferMode : 'min';
}

// ── 검증 (§3.0) ─────────────────────────────────────────────

export interface LedgerIssue {
  message: string;
  /** 오류 표시할 행 */
  target?: { kind: 'participant' | 'expense' | 'treasurer'; id?: string };
}

/**
 * @param treasurerUserIds 편집 권한 총무들 — 비어 있지 않으면 정산 총무(◉)는 이 중 한 명이어야 한다
 */
export function validateLedger(data: MeetupLedgerData, treasurerUserIds: string[] = []): LedgerIssue[] {
  const issues: LedgerIssue[] = [];
  const pIds = new Set(data.participants.map((p) => p.id));

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
  });

  data.expenses.forEach((e, i) => {
    const name = e.label.trim() || `지출 ${i + 1}번`;
    if (!e.label.trim()) issues.push({ message: `지출 ${i + 1}번의 항목명이 비어 있습니다.`, target: { kind: 'expense', id: e.id } });
    if (!(e.amount > 0)) issues.push({ message: `${name}: 금액을 입력하세요.`, target: { kind: 'expense', id: e.id } });
    if (e.paidBy !== TREASURY && !pIds.has(e.paidBy)) {
      issues.push({ message: `${name}: 결제자가 삭제되었습니다. 다시 선택하세요.`, target: { kind: 'expense', id: e.id } });
    }
    if (expenseSharers(data, e).length === 0) {
      issues.push({ message: `${name}: 참석자가 없습니다. 1명 이상 참석으로 두세요.`, target: { kind: 'expense', id: e.id } });
    }
  });

  const settleTreasurer = data.participants.find((p) => p.id === data.treasurerId);
  if (data.treasurerId && !settleTreasurer) {
    issues.push({ message: '총무로 지정된 참가자가 삭제되었습니다. 다시 지정하세요.', target: { kind: 'treasurer' } });
  } else if (settleTreasurer && treasurerUserIds.length > 0 && !treasurerUserIds.includes(settleTreasurer.userId ?? '')) {
    issues.push({ message: '정산 총무(송금 받는 사람)는 총무 중 한 명이어야 합니다.', target: { kind: 'treasurer' } });
  } else if (!data.treasurerId && needsTreasurer(data)) {
    issues.push({ message: '선입금이나 모임 통장 결제가 있으면 정산 총무를 지정해야 합니다.', target: { kind: 'treasurer' } });
  }

  return issues;
}

// ── 분배 ───────────────────────────────────────────────────

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

// ── 정산 (§3.4) ─────────────────────────────────────────────

export interface ParticipantBalance {
  id: string;
  name: string;
  prepaid: number;
  /** 부담해야 할 돈 = 참석한 이벤트 몫의 합 */
  owed: number;
  /** 이미 낸 돈 = 선입금 + 직접 결제한 지출 */
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
  /** 모임 통장의 순잔액 b_T = −C (정산 후 통장은 0) */
  treasuryBalance: number;
  /** 지금 통장에 있는 돈 C = 선입금 합계 − 통장 결제 */
  treasuryCash: number;
  transferMode: MeetupTransferMode;
  transfers: SettlementTransfer[];
  /** 불변식 Σb_i + b_T = 0 */
  balanced: boolean;
  /** min 모드인데 정산 완료 기록이 남아 있는 사람이 있음 (기록은 무시됨) */
  ignoredSettled: boolean;
}

export function computeSettlement(data: MeetupLedgerData): SettlementResult {
  const share = new Map<string, number>();
  for (const e of data.expenses) {
    for (const [id, v] of splitEven(e.amount, expenseSharers(data, e))) share.set(id, (share.get(id) ?? 0) + v);
  }
  const paidExpense = new Map<string, number>();
  for (const e of data.expenses) {
    if (e.paidBy !== TREASURY) paidExpense.set(e.paidBy, (paidExpense.get(e.paidBy) ?? 0) + e.amount);
  }

  const mode = effectiveTransferMode(data);
  const rows: ParticipantBalance[] = data.participants.map((p) => {
    const owed = share.get(p.id) ?? 0;
    const paid = p.prepaid + (paidExpense.get(p.id) ?? 0);
    const balance = paid - owed;
    const isTreasurer = p.id === data.treasurerId;
    const settled = p.settledAmount !== null && !isTreasurer;
    return {
      id: p.id,
      name: p.name.trim(),
      prepaid: p.prepaid,
      owed,
      paid,
      balance,
      isTreasurer,
      settled,
      diff: settled && mode === 'hub' ? balance - (p.settledAmount as number) : 0,
    };
  });

  const totalExpense = data.expenses.reduce((s, e) => s + e.amount, 0);
  const totalPrepaid = data.participants.reduce((s, p) => s + p.prepaid, 0);
  const treasuryPaid = data.expenses.filter((e) => e.paidBy === TREASURY).reduce((s, e) => s + e.amount, 0);
  const treasuryCash = totalPrepaid - treasuryPaid;
  const treasuryBalance = -treasuryCash;
  const balanced = rows.reduce((s, r) => s + r.balance, 0) + treasuryBalance === 0;

  const transfers = mode === 'hub' ? hubTransfers(rows) : minTransfers(rows, treasuryBalance, !!data.treasurerId);

  return {
    summary: { totalExpense, totalPrepaid, treasuryPaid, treasuryCash },
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

/** "전원 분담 (3명)" / "2명 분담 · 불참 C" / "2명 분담 · 불참 4명" */
export function coverLabel(data: MeetupLedgerData, e: MeetupExpense): string {
  const n = expenseSharers(data, e).length;
  if (e.absent.length === 0) return `전원 분담 (${n}명)`;
  const absent = e.absent.map((id) => nodeName(data, id));
  return absent.length <= 3 ? `${n}명 분담 · 불참 ${absent.join(', ')}` : `${n}명 분담 · 불참 ${absent.length}명`;
}

export function buildPublicSnapshot(data: MeetupLedgerData, result: SettlementResult): MeetupPublicSnapshot {
  const treasurer = data.participants.find((p) => p.id === data.treasurerId);
  return {
    version: 2,
    generatedAt: new Date().toISOString(),
    treasurerName: treasurer ? treasurer.name.trim() : null,
    transferMode: result.transferMode,
    summary: result.summary,
    expenses: data.expenses.map((e) => ({
      label: e.label.trim(),
      category: e.category,
      amount: e.amount,
      payerName: e.paidBy === TREASURY ? '모임 통장' : nodeName(data, e.paidBy),
      coverLabel: coverLabel(data, e),
    })),
    participants: result.rows.map((r) => ({
      name: r.name,
      prepaid: r.prepaid,
      absentEvents: absentEventsOf(data, r.id),
      owed: r.owed,
      paid: r.paid,
      balance: r.balance,
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

/** 한 줄 요약: "선입금 60,000원 · 총지출 40,000원" */
export function summaryText(summary: MeetupSummary): string {
  const total = `총지출 ${won(summary.totalExpense)}`;
  return summary.totalPrepaid > 0 ? `선입금 ${won(summary.totalPrepaid)} · ${total}` : total;
}

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
  if (s.totalPrepaid > 0) parts.push(`선입금 ${s.totalPrepaid.toLocaleString('ko-KR')}`);
  parts.push(`총지출 ${s.totalExpense.toLocaleString('ko-KR')}`);
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
