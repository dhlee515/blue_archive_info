// 관리자 장부 화면 / 공개 결산 화면 공용 — 공개 스냅샷 형태를 그대로 렌더 (읽기 전용)

import { useState, type ReactNode } from 'react';
import { ArrowRight, Check, ChevronDown, Copy } from 'lucide-react';
import type { LegacyMeetupSummary, MeetupPublicSnapshot, MeetupSummary } from '@/types/meetup';
import { won } from '@/service/meetup/utils/meetupSettlement';

const card = 'bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700';
const fmt = (n: number) => n.toLocaleString('ko-KR');

export function SectionCard({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className={`${card} overflow-hidden`}>
      <div className="flex items-center justify-between gap-2 px-4 py-3 md:px-5 border-b border-gray-200 dark:border-slate-700 bg-teal-50/60 dark:bg-teal-900/20">
        <h2 className="text-sm font-bold text-teal-800 dark:text-teal-300">{title}</h2>
        {right}
      </div>
      <div className="p-4 md:p-5">{children}</div>
    </section>
  );
}

function Stat({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'plus' | 'minus' }) {
  const color =
    tone === 'plus'
      ? 'text-teal-700 dark:text-teal-300'
      : tone === 'minus'
        ? 'text-red-600 dark:text-red-400'
        : 'text-gray-800 dark:text-slate-100';
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 px-3 py-2.5 min-w-0">
      <div className="text-[11px] text-gray-500 dark:text-slate-400">{label}</div>
      <div className={`text-base md:text-lg font-bold tabular-nums truncate ${color}`}>{value}</div>
    </div>
  );
}

/**
 * @param compact 공개 페이지용 — 총지출 · 선입금만 (통장 현황은 총무에게 필요한 숫자라 관리 화면에서만)
 */
export function SummaryGrid({ summary, compact = false }: { summary: MeetupSummary | LegacyMeetupSummary; compact?: boolean }) {
  if (!('totalPrepaid' in summary)) return <LegacySummaryGrid summary={summary} />;
  const hasTreasury = !compact && (summary.totalPrepaid > 0 || summary.treasuryPaid > 0);
  return (
    // 화면 폭이 아니라 카드 폭 기준 (관리 화면 오른쪽 좁은 칸에서도 금액이 잘리지 않게)
    <div className="@container flex flex-col gap-2">
      <div className="grid grid-cols-2 @lg:grid-cols-4 gap-2">
        <Stat label="총지출" value={won(summary.totalExpense)} />
        {summary.totalPrepaid > 0 && <Stat label="선입금 합계" value={won(summary.totalPrepaid)} />}
        {hasTreasury && summary.treasuryPaid > 0 && <Stat label="통장에서 결제" value={won(summary.treasuryPaid)} />}
        {hasTreasury && (
          <Stat
            label="정산 전 통장"
            value={won(summary.treasuryCash)}
            tone={summary.treasuryCash > 0 ? 'plus' : summary.treasuryCash < 0 ? 'minus' : 'default'}
          />
        )}
      </div>
      {hasTreasury && (
        <p className="text-xs text-gray-500 dark:text-slate-400">
          {summary.treasuryCash > 0
            ? `통장에 남은 ${won(summary.treasuryCash)}은 정산 때 돌려줍니다.`
            : summary.treasuryCash < 0
              ? `총무가 먼저 낸 ${won(-summary.treasuryCash)}은 정산 때 받습니다.`
              : '지금 통장 잔액은 0원입니다.'}
          {' '}정산이 끝나면 통장은 0원이 됩니다.
        </p>
      )}
    </div>
  );
}

/** 참가비 구간 방식 시절 공개 스냅샷 — 다시 저장하기 전까지 공개 페이지에 남아 있을 수 있음 */
function LegacySummaryGrid({ summary }: { summary: LegacyMeetupSummary }) {
  const hasFund = summary.totalFee > 0 || summary.feeCovered > 0;
  return (
    <div className="@container flex flex-col gap-2">
      <div className="grid grid-cols-2 @lg:grid-cols-4 gap-2">
        {summary.totalFee > 0 && <Stat label="총 참가비" value={won(summary.totalFee)} />}
        {summary.totalFee > 0 && <Stat label="납부된 참가비" value={won(summary.paidFee)} />}
        <Stat label="총지출" value={won(summary.totalExpense)} />
        {hasFund && (
          <Stat
            label="회비 잔액"
            value={won(summary.r0)}
            tone={summary.r0 > 0 ? 'plus' : summary.r0 < 0 ? 'minus' : 'default'}
          />
        )}
      </div>
      {hasFund && (
        <p className="text-xs text-gray-500 dark:text-slate-400">
          회비 충당 {won(summary.feeCovered)} · 참가자 분담 {won(summary.splitTotal)}
          {summary.finalBalance !== 0 && <> · 정산 후 통장 {won(summary.finalBalance)}</>}
        </p>
      )}
    </div>
  );
}

type BalanceRow = MeetupPublicSnapshot['participants'][number];

const badge = 'text-[10px] px-1.5 py-0.5 rounded';

const muted = 'text-gray-500 dark:text-slate-400 font-normal';

/** 정산 전 금액 — "받을 돈 5,000원" / "보낼 돈 10,500원" (아직 주고받기 전이므로 '받음 · 보냄' 이 아님) */
function dueView(balance: number): { text: string; color: string } {
  if (balance > 0) return { text: `받을 돈 ${fmt(balance)}원`, color: 'text-teal-700 dark:text-teal-300' };
  if (balance < 0) return { text: `보낼 돈 ${fmt(-balance)}원`, color: 'text-red-600 dark:text-red-400' };
  return { text: '주고받을 돈 없음', color: muted };
}

/**
 * 참가자 줄의 정산 칸. 총무는 통장과 합쳐 정리되므로 따로 표시하지 않음.
 * 정산 완료 체크된 사람은 완료 시점에 실제로 주고받은 금액을 과거형으로 (그 뒤 차액은 배지로 따로)
 */
function balanceView(r: BalanceRow): { text: string; color: string } {
  if (r.isTreasurer) return { text: '통장에서 정리', color: muted };
  if (r.settled) {
    const done = r.balance - r.diff;
    return { text: done > 0 ? `✓ ${fmt(done)}원 받음` : done < 0 ? `✓ ${fmt(-done)}원 보냄` : '✓ 정산 완료', color: muted };
  }
  return dueView(r.balance);
}

/** 펼친 내역: 참석한 이벤트별 몫 → 부담, 선입금 + 직접 결제 → 낸 돈, 차이 */
function BalanceDetail({ r }: { r: BalanceRow }) {
  const line = 'flex items-baseline justify-between gap-3';
  const shares = r.shares ?? [];
  const due = dueView(r.balance);
  return (
    <div className="col-span-full sm:max-w-md mt-1.5 mb-0.5 rounded-lg bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 px-3 py-2 text-xs text-gray-600 dark:text-slate-300 tabular-nums flex flex-col gap-0.5">
      {shares.length === 0 ? (
        <div className="text-gray-400 dark:text-slate-500">참석한 이벤트가 없습니다.</div>
      ) : (
        shares.map((s, k) => (
          <div key={k} className={line}>
            <span className="min-w-0 break-all">{s.label}</span>
            <span>{fmt(s.amount)}</span>
          </div>
        ))
      )}
      <div className={`${line} font-bold text-gray-800 dark:text-slate-100 border-t border-gray-200 dark:border-slate-700 pt-1 mt-0.5`}>
        <span>부담 합계</span>
        <span>{fmt(r.owed)}</span>
      </div>
      {!!r.prepaid && (
        <div className={line}><span>선입금</span><span>{fmt(r.prepaid)}</span></div>
      )}
      {!!r.paidDirect && (
        <div className={line}><span>직접 결제</span><span>{fmt(r.paidDirect)}</span></div>
      )}
      <div className={`${line} font-bold text-gray-800 dark:text-slate-100`}>
        <span>낸 돈 합계</span>
        <span>{fmt(r.paid)}</span>
      </div>
      <div className={`${line} font-bold border-t border-gray-200 dark:border-slate-700 pt-1 mt-0.5`}>
        <span>{r.isTreasurer ? '총무 — 통장과 합쳐 정리' : '낸 돈 − 부담'}</span>
        <span className={due.color}>{r.isTreasurer ? '' : due.text}</span>
      </div>
    </div>
  );
}

/** 사람별 부담 / 낸 돈 / 순잔액. 이름을 누르면 내역이 펼쳐짐. renderAction 은 관리자 화면의 정산 완료 체크 칸 */
export function BalanceList({
  rows,
  renderAction,
}: {
  rows: BalanceRow[];
  renderAction?: (index: number) => ReactNode;
}) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const toggle = (i: number) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  if (rows.length === 0) {
    return <p className="text-sm text-gray-400 dark:text-slate-500">참가자가 없습니다.</p>;
  }
  // 이전 스냅샷에는 내역이 없어서 펼칠 수 없음
  const expandable = rows.some((r) => r.shares);
  return (
    <div className="flex flex-col divide-y divide-gray-100 dark:divide-slate-700">
      <div className="hidden sm:grid grid-cols-[1fr_6rem_6rem_9rem_auto] gap-2 pb-2 text-[11px] text-gray-500 dark:text-slate-400">
        <span>참가자{expandable && ' (누르면 내역)'}</span>
        <span className="text-right">부담</span>
        <span className="text-right">낸 돈</span>
        <span className="text-right">정산</span>
        <span className="w-16" />
      </div>
      {rows.map((r, i) => {
        const bv = balanceView(r);
        const isOpen = open.has(i);
        return (
        <div
          key={`${r.name}-${i}`}
          className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_6rem_6rem_9rem_auto] gap-x-2 gap-y-0.5 py-2 items-center text-sm"
        >
          <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
            {r.shares ? (
              <button
                type="button"
                onClick={() => toggle(i)}
                aria-expanded={isOpen}
                className="inline-flex items-center gap-0.5 min-w-0 font-medium text-gray-800 dark:text-slate-100 hover:text-teal-700 dark:hover:text-teal-300"
              >
                <span className="truncate">{r.name}</span>
                <ChevronDown size={14} className={`shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
            ) : (
              <span className="font-medium text-gray-800 dark:text-slate-100 truncate">{r.name}</span>
            )}
            {r.isTreasurer && <span className={`${badge} bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300`}>총무</span>}
            {!!r.prepaid && (
              <span className={`${badge} bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 tabular-nums`}>선입금 {fmt(r.prepaid)}</span>
            )}
            {/* 이전 형식 스냅샷 (참가비 구간) */}
            {r.tierLabel && <span className={`${badge} bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300`}>{r.tierLabel}</span>}
            {r.absentEvents && r.absentEvents.length > 0 && (
              <span className={`${badge} bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 break-all`}>
                불참 {r.absentEvents.join(', ')}
              </span>
            )}
            {/* 이전 형식 스냅샷 (참석 기간 방식) */}
            {r.attendLabel && (
              <span className={`${badge} bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300`}>{r.attendLabel} 참석</span>
            )}
            {r.tierLabel && !r.feePaid && !r.isTreasurer && (
              <span className={`${badge} bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300`}>참가비 미납</span>
            )}
            {r.settled && <span className={`${badge} bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300`}>정산 완료</span>}
            {r.settled && r.diff !== 0 && (
              <span className={`${badge} bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 tabular-nums`}>
                {r.diff > 0 ? `추가로 받을 돈 ${fmt(r.diff)}` : `추가로 보낼 돈 ${fmt(-r.diff)}`}
              </span>
            )}
          </div>
          <span className="sm:hidden row-span-2 self-center">{renderAction?.(i)}</span>
          <span className="sm:text-right text-xs sm:text-sm text-gray-500 sm:text-gray-700 dark:text-slate-400 sm:dark:text-slate-300 tabular-nums">
            <span className="sm:hidden">부담 </span>{fmt(r.owed)}
            <span className="sm:hidden"> · 낸 돈 {fmt(r.paid)} · </span>
            <span className={`sm:hidden font-bold ${bv.color}`}>{bv.text}</span>
          </span>
          <span className="hidden sm:block text-right tabular-nums text-gray-700 dark:text-slate-300">{fmt(r.paid)}</span>
          <span className={`hidden sm:block text-right font-bold tabular-nums ${bv.color} ${r.isTreasurer ? 'text-xs' : ''}`}>
            {bv.text}
          </span>
          <span className="hidden sm:flex w-16 justify-end">{renderAction?.(i)}</span>
          {isOpen && <BalanceDetail r={r} />}
        </div>
        );
      })}
    </div>
  );
}

type Transfer = { from: string; to: string; amount: number };

/**
 * 남은 송금 + 완료된 송금 (취소선).
 * @param copyable 금액을 누르면 숫자만 복사 (은행 앱 붙여넣기용) — 공개 페이지
 */
export function TransferList({
  transfers,
  completed = [],
  copyable = false,
}: {
  transfers: Transfer[];
  completed?: Transfer[];
  copyable?: boolean;
}) {
  const [copied, setCopied] = useState<number | null>(null);
  const copy = async (i: number, amount: number) => {
    const text = String(amount);
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      // 카톡 등 인앱 브라우저는 Clipboard API 가 막혀 있는 경우가 있어 예전 방식으로 한 번 더 시도
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        ok = document.execCommand('copy');
      } catch (error) {
        console.error('Failed to copy amount:', error);
      }
      document.body.removeChild(ta);
    }
    if (!ok) return;
    setCopied(i);
    setTimeout(() => setCopied((c) => (c === i ? null : c)), 1500);
  };

  const row = 'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm';
  return (
    <div className="flex flex-col gap-1.5">
      {transfers.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-slate-400">
          {completed.length > 0 ? '남은 송금이 없습니다.' : '주고받을 돈이 없습니다.'}
        </p>
      )}
      {transfers.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {transfers.map((t, i) => (
            <li key={i} className={`${row} bg-gray-50 dark:bg-slate-900 border-gray-200 dark:border-slate-700`}>
              <span className="font-medium text-gray-800 dark:text-slate-100 truncate min-w-0">{t.from}</span>
              <ArrowRight size={14} className="shrink-0 text-gray-400" />
              <span className="font-medium text-gray-800 dark:text-slate-100 truncate min-w-0">{t.to}</span>
              {copyable ? (
                <button
                  type="button"
                  onClick={() => copy(i, t.amount)}
                  title="금액 복사"
                  className="ml-auto shrink-0 inline-flex items-center gap-1 font-bold tabular-nums text-teal-700 dark:text-teal-300 hover:underline"
                >
                  {copied === i ? <><Check size={13} />복사됨</> : <>{won(t.amount)}<Copy size={12} className="text-gray-400" /></>}
                </button>
              ) : (
                <span className="ml-auto font-bold tabular-nums text-teal-700 dark:text-teal-300 shrink-0">{won(t.amount)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {completed.length > 0 && (
        <ul className="flex flex-col gap-1.5" aria-label="완료된 송금">
          {completed.map((t, i) => (
            <li key={i} className={`${row} border-dashed border-gray-200 dark:border-slate-700 text-gray-400 dark:text-slate-500`}>
              <Check size={14} className="shrink-0 text-teal-600 dark:text-teal-400" />
              <span className="truncate min-w-0 line-through">{t.from}</span>
              <ArrowRight size={14} className="shrink-0" />
              <span className="truncate min-w-0 line-through">{t.to}</span>
              <span className="ml-auto shrink-0 tabular-nums line-through">{won(t.amount)}</span>
              <span className="shrink-0 text-[10px] text-teal-700 dark:text-teal-300">완료</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
