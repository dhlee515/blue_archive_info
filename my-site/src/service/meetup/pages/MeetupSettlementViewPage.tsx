import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router';
import { CheckCircle2 } from 'lucide-react';
import type { MeetupPublicSettlement } from '@/types/meetup';
import { MeetupRepository } from '@/repositories/meetupRepository';
import { CATEGORY_LABELS, formatPeriod, transferTitle, won } from '@/service/meetup/utils/meetupSettlement';
import { BalanceList, SectionCard, SummaryGrid, TransferList } from '@/service/meetup/components/SettlementSections';

/** "10/6 21:00" */
function shortDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 공개 결산 페이지 (/m/:slug) — 관리자가 공개를 켠 장부의 스냅샷만 표시. 링크를 받은 참가자가 "내 송금"을 먼저 보도록 송금 → 참가자 → 지출 → 요약 순 */
export default function MeetupSettlementViewPage() {
  const { slug } = useParams<{ slug: string }>();
  const [settlement, setSettlement] = useState<MeetupPublicSettlement | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        if (!slug) return;
        setSettlement(await MeetupRepository.getSettlementBySlug(slug));
      } catch (error) {
        console.error('Failed to fetch meetup settlement:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [slug]);

  // 검색엔진 인덱싱 방지
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => {
      document.head.removeChild(meta);
    };
  }, []);

  // 브라우저 탭 제목
  const pageTitle = settlement?.title;
  useEffect(() => {
    if (!pageTitle) return;
    const prev = document.title;
    document.title = `${pageTitle} 정산`;
    return () => {
      document.title = prev;
    };
  }, [pageTitle]);

  if (loading) {
    return <div className="text-center py-12 text-gray-400 dark:text-slate-400">데이터를 불러오는 중...</div>;
  }

  const snap = settlement?.snapshot;
  if (!settlement || !snap) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 dark:text-slate-400 mb-4">결산을 찾을 수 없습니다. 비공개로 바뀌었거나 삭제되었을 수 있습니다.</p>
        <Link to="/" className="text-blue-600 dark:text-blue-400 hover:underline">홈으로 돌아가기</Link>
      </div>
    );
  }

  const closed = settlement.status === 'closed';

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-4 md:gap-6">
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl md:text-3xl font-extrabold text-blue-900 dark:text-blue-300 tracking-tight break-all">
            {settlement.title}
          </h1>
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded ${
              closed
                ? 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-300'
                : 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300'
            }`}
          >
            {closed ? '정산 완료' : '정산 진행 중'}
          </span>
        </div>
        <p className="text-gray-500 dark:text-slate-300 mt-1 text-sm">
          {settlement.meetupDate && <>{formatPeriod(settlement.meetupDate, settlement.meetupEndDate)} · </>}
          {snap.treasurerName && <>총무 {snap.treasurerName} · </>}
          <span className="whitespace-nowrap">{shortDateTime(settlement.updatedAt)} 갱신</span>
        </p>
      </div>

      {closed && (
        <div className="flex items-start gap-2 rounded-xl border border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-900/30 px-4 py-3 text-teal-800 dark:text-teal-200">
          <CheckCircle2 size={20} className="shrink-0 mt-0.5" />
          <div>
            <div className="font-bold">정산이 끝났습니다.</div>
            <div className="text-sm">아래 송금 목록은 기록으로 남겨 둔 것입니다.</div>
          </div>
        </div>
      )}

      <SectionCard title={transferTitle(snap, closed ? '송금 기록' : '송금')}>
        <div className="flex flex-col gap-2">
          <TransferList transfers={snap.transfers} completed={snap.completedTransfers} copyable={!closed} />
          {!closed && snap.transfers.length > 0 && (
            <p className="text-xs text-gray-400 dark:text-slate-500">금액을 누르면 숫자만 복사됩니다. 계좌는 총무에게 확인하세요.</p>
          )}
        </div>
      </SectionCard>

      <SectionCard title={`참가자 ${snap.participants.length}명`}>
        <BalanceList rows={snap.participants} />
      </SectionCard>

      <SectionCard title={`지출 ${snap.expenses.length}건`}>
        {snap.expenses.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-slate-500">지출 내역이 없습니다.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-gray-100 dark:divide-slate-700">
            {snap.expenses.map((e, i) => {
              const n = e.sharerCount ?? 0;
              return (
                <li key={i} className="py-2 flex items-start gap-2 text-sm">
                  <span className="text-[10px] px-1.5 py-0.5 mt-0.5 rounded bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 shrink-0">
                    {CATEGORY_LABELS[e.category]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-gray-800 dark:text-slate-100 break-all">{e.label}</div>
                    <div className="text-xs text-gray-500 dark:text-slate-400">
                      {e.date && <>{e.date.slice(5)} · </>}결제 {e.payerName} · {e.coverLabel}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-bold tabular-nums text-gray-800 dark:text-slate-100">{won(e.amount)}</div>
                    {n > 0 && (
                      <div className="text-[11px] tabular-nums text-gray-500 dark:text-slate-400">
                        1인 {e.amount % n === 0 ? '' : '약 '}{won(Math.floor(e.amount / n))}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="요약">
        <SummaryGrid summary={snap.summary} compact />
      </SectionCard>
    </div>
  );
}
