// 관리자 장부 화면 / 공개 결산 화면 공용 — 공개 스냅샷 형태를 그대로 렌더 (읽기 전용)

import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import type { MeetupPublicSnapshot, MeetupSummary } from '@/types/meetup';
import { surplusText, won } from '@/service/meetup/utils/meetupSettlement';

const card = 'bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700';

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

export function SummaryGrid({ summary }: { summary: MeetupSummary }) {
  const hasFund = summary.totalFee > 0 || summary.feeCovered > 0;
  return (
    // 화면 폭이 아니라 카드 폭 기준 (관리 화면 오른쪽 좁은 칸에서도 금액이 잘리지 않게)
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
          회비 충당 {won(summary.feeCovered)} · 참가자 분담 {won(summary.splitTotal)} · {surplusText(summary)}
          {summary.finalBalance !== 0 && <> · 정산 후 통장 {won(summary.finalBalance)}</>}
        </p>
      )}
    </div>
  );
}

type BalanceRow = MeetupPublicSnapshot['participants'][number];

/** 사람별 부담 / 낸 돈 / 순잔액. renderAction 은 관리자 화면의 정산 완료 체크 칸 */
export function BalanceList({
  rows,
  renderAction,
}: {
  rows: BalanceRow[];
  renderAction?: (index: number) => ReactNode;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-gray-400 dark:text-slate-500">참가자가 없습니다.</p>;
  }
  return (
    <div className="flex flex-col divide-y divide-gray-100 dark:divide-slate-700">
      <div className="hidden sm:grid grid-cols-[1fr_6rem_6rem_7rem_auto] gap-2 pb-2 text-[11px] text-gray-500 dark:text-slate-400">
        <span>참가자</span>
        <span className="text-right">부담</span>
        <span className="text-right">낸 돈</span>
        <span className="text-right">받을(+) / 보낼(−)</span>
        <span className="w-16" />
      </div>
      {rows.map((r, i) => {
        // 총무는 통장과 합쳐 정리되므로 개인 순잔액 대신 안내 문구
        const balanceText = r.isTreasurer
          ? '통장에서 정리'
          : `${r.balance > 0 ? '+' : r.balance < 0 ? '−' : ''}${Math.abs(r.balance).toLocaleString('ko-KR')}`;
        const balanceColor = r.isTreasurer || r.balance === 0
          ? 'text-gray-500 dark:text-slate-400 font-normal'
          : r.balance > 0 ? 'text-teal-700 dark:text-teal-300' : 'text-red-600 dark:text-red-400';
        return (
        <div
          key={`${r.name}-${i}`}
          className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_6rem_6rem_7rem_auto] gap-x-2 gap-y-0.5 py-2 items-center text-sm"
        >
          <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
            <span className="font-medium text-gray-800 dark:text-slate-100 truncate">{r.name}</span>
            {r.isTreasurer && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                총무
              </span>
            )}
            {r.tierLabel && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300">
                {r.tierLabel}
              </span>
            )}
            {r.attendLabel && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300">
                {r.attendLabel} 참석
              </span>
            )}
            {r.tierLabel && !r.feePaid && !r.isTreasurer && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                참가비 미납
              </span>
            )}
            {r.settled && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300">
                정산 완료
              </span>
            )}
            {r.settled && r.diff !== 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 tabular-nums">
                차액 {r.diff > 0 ? '+' : '−'}{Math.abs(r.diff).toLocaleString('ko-KR')}
              </span>
            )}
          </div>
          <span className="sm:hidden row-span-2 self-center">{renderAction?.(i)}</span>
          <span className="sm:text-right text-xs sm:text-sm text-gray-500 sm:text-gray-700 dark:text-slate-400 sm:dark:text-slate-300 tabular-nums">
            <span className="sm:hidden">부담 </span>{r.owed.toLocaleString('ko-KR')}
            <span className="sm:hidden"> · 낸 돈 {r.paid.toLocaleString('ko-KR')} · </span>
            <span className={`sm:hidden font-bold ${balanceColor}`}>{balanceText}</span>
          </span>
          <span className="hidden sm:block text-right tabular-nums text-gray-700 dark:text-slate-300">{r.paid.toLocaleString('ko-KR')}</span>
          <span className={`hidden sm:block text-right font-bold tabular-nums ${balanceColor} ${r.isTreasurer ? 'text-xs' : ''}`}>
            {balanceText}
          </span>
          <span className="hidden sm:flex w-16 justify-end">{renderAction?.(i)}</span>
        </div>
        );
      })}
    </div>
  );
}

export function TransferList({ transfers }: { transfers: { from: string; to: string; amount: number }[] }) {
  if (transfers.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-slate-400">주고받을 돈이 없습니다.</p>;
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {transfers.map((t, i) => (
        <li
          key={i}
          className="flex items-center gap-2 rounded-lg bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 px-3 py-2 text-sm"
        >
          <span className="font-medium text-gray-800 dark:text-slate-100 truncate min-w-0">{t.from}</span>
          <ArrowRight size={14} className="shrink-0 text-gray-400" />
          <span className="font-medium text-gray-800 dark:text-slate-100 truncate min-w-0">{t.to}</span>
          <span className="ml-auto font-bold tabular-nums text-teal-700 dark:text-teal-300 shrink-0">{won(t.amount)}</span>
        </li>
      ))}
    </ul>
  );
}
