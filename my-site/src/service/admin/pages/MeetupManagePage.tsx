import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { ChevronDown, ChevronRight, Globe, UserCog } from 'lucide-react';
import type { MeetupLedger } from '@/types/meetup';
import type { UserProfile } from '@/types/auth';
import { MeetupRepository } from '@/repositories/meetupRepository';
import { useAuthStore, useCanEdit, useIsAdmin } from '@/stores/authStore';
import { newId } from '@/utils/id';
import MemberPickerModal from '@/service/meetup/components/MemberPickerModal';
import {
  computeSettlement,
  emptyLedgerData,
  formatPeriod,
  normalizePeriod,
  periodError,
  surplusText,
} from '@/service/meetup/utils/meetupSettlement';

function ledgerSubtitle(ledger: MeetupLedger): string {
  const { summary } = computeSettlement(ledger.data);
  // 총무 = 편집 권한 회원들 (참가자로 들어가 있으므로 이름은 참가자 목록에서)
  const names = ledger.data.participants.filter((p) => p.userId && ledger.treasurerUserIds.includes(p.userId)).map((p) => p.name);
  const parts = [`총무 ${names.length > 0 ? names.join(', ') : '미지정'}`, `참가자 ${ledger.data.participants.length}명`];
  if (summary.totalFee > 0 || summary.feeCovered > 0) parts.push(surplusText(summary));
  else if (summary.totalExpense > 0) parts.push(`총지출 ${summary.totalExpense.toLocaleString('ko-KR')}원`);
  return parts.join(' · ');
}

export default function MeetupManagePage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  /** admin = 생성 · 전체 편집, editor = 전체 열람, 총무 = 자기 모임 편집 (RLS 도 동일) */
  const isAdmin = useIsAdmin();
  const canEdit = useCanEdit();
  const [treasurers, setTreasurers] = useState<UserProfile[]>([]);
  const [showTreasurerPicker, setShowTreasurerPicker] = useState(false);
  const [ledgers, setLedgers] = useState<MeetupLedger[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [deleted, setDeleted] = useState<MeetupLedger[] | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLedgers(await MeetupRepository.getLedgers());
      } catch (error) {
        console.error('Failed to fetch meetup ledgers:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const loadDeleted = async () => {
    try {
      setDeleted(await MeetupRepository.getDeletedLedgers());
    } catch (error) {
      console.error('Failed to fetch deleted ledgers:', error);
      alert('삭제된 모임을 불러오지 못했습니다.');
    }
  };

  const toggleDeleted = () => {
    const next = !showDeleted;
    setShowDeleted(next);
    if (next && deleted === null) loadDeleted();
  };

  const createPeriodError = periodError(startDate, endDate);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !title.trim() || createPeriodError || treasurers.length === 0) return;
    setCreating(true);
    try {
      const period = normalizePeriod(startDate, endDate);
      // 총무들 = 첫 참가자들, 첫 번째 총무가 정산 총무(송금 받는 사람)
      const taken = new Set<string>();
      const participants = treasurers.map((t) => {
        const base = t.nickname.trim() || '(닉네임 없음)';
        let name = base;
        for (let k = 2; taken.has(name); k++) name = `${base} (${k})`;
        taken.add(name);
        return {
          id: newId(),
          userId: t.id,
          name,
          feeTierId: null,
          feePaid: false,
          settledAmount: null,
          memo: '',
        };
      });
      const data = { ...emptyLedgerData(), treasurerId: participants[0].id, participants };
      const ledger = await MeetupRepository.createLedger(
        title.trim(),
        period.meetupDate,
        period.meetupEndDate,
        data,
        treasurers.map((t) => t.id),
        user.id,
      );
      navigate(`/admin/meetups/${ledger.id}`);
    } catch (error) {
      console.error('Failed to create ledger:', error);
      alert('모임 장부를 만들지 못했습니다.');
      setCreating(false);
    }
  };

  const handleDelete = async (ledger: MeetupLedger) => {
    if (!confirm(`"${ledger.title}" 장부를 삭제하시겠습니까?\n공개 링크도 함께 막힙니다.`)) return;
    setDeletingId(ledger.id);
    try {
      await MeetupRepository.deleteLedger(ledger.id);
      setLedgers((prev) => prev.filter((l) => l.id !== ledger.id));
      if (deleted !== null) setDeleted([{ ...ledger, deletedAt: new Date().toISOString() }, ...deleted]);
    } catch (error) {
      console.error('Failed to delete ledger:', error);
      alert('삭제에 실패했습니다.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleRestore = async (ledger: MeetupLedger) => {
    setRestoringId(ledger.id);
    try {
      await MeetupRepository.restoreLedger(ledger.id);
      setDeleted((prev) => (prev ?? []).filter((l) => l.id !== ledger.id));
      setLedgers(await MeetupRepository.getLedgers());
    } catch (error) {
      console.error('Failed to restore ledger:', error);
      alert('복원에 실패했습니다.');
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-4 md:gap-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-blue-900 dark:text-blue-300 tracking-tight">모임 회계</h1>
        <p className="text-gray-500 dark:text-slate-300 mt-1 text-sm md:text-base">
          오프라인 모임의 참가비 · 지출을 기록하고 정산 송금 목록을 만듭니다.{' '}
          {isAdmin
            ? '(최고 관리자: 생성 · 편집 / 부관리자: 열람 / 총무: 담당 모임 편집)'
            : canEdit
              ? '(부관리자는 열람만 — 내가 총무인 모임은 편집할 수 있습니다)'
              : '(내가 총무인 모임만 보입니다)'}
        </p>
      </div>

      {isAdmin && (
        <form
          onSubmit={handleCreate}
          className="flex flex-col gap-2 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-3 md:p-4"
        >
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="모임 이름 (예: 10월 오프모임)"
              className="flex-1 min-w-0 p-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-slate-100 text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none"
            />
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                aria-label="시작일"
                className="flex-1 min-w-0 p-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-slate-100 text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
              <span className="text-gray-400 dark:text-slate-500">~</span>
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
                aria-label="끝일 (하루 모임이면 비워 두세요)"
                title="하루 모임이면 비워 두세요"
                className={`flex-1 min-w-0 p-2 border rounded-lg bg-white dark:bg-slate-700 dark:text-slate-100 text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none ${
                  createPeriodError ? 'border-red-400' : 'border-gray-300 dark:border-slate-600'
                }`}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowTreasurerPicker(true)}
              className={`flex-1 min-w-0 inline-flex items-center gap-2 p-2 border rounded-lg text-sm text-left transition-colors ${
                treasurers.length > 0
                  ? 'border-teal-400 bg-teal-50 dark:bg-teal-900/30 text-teal-800 dark:text-teal-200'
                  : 'border-dashed border-gray-300 dark:border-slate-600 text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}
            >
              <UserCog size={16} className="shrink-0" />
              <span className="truncate">
                {treasurers.length > 0
                  ? `총무: ${treasurers.map((t) => t.nickname).join(', ')}`
                  : '총무 지정 (필수, 여러 명 가능) — 이 모임을 편집할 회원'}
              </span>
            </button>
            <button
              type="submit"
              disabled={creating || !title.trim() || !!createPeriodError || treasurers.length === 0}
              className="bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold py-2 px-4 rounded-lg transition-colors text-sm"
            >
              {creating ? '만드는 중...' : '새 모임'}
            </button>
          </div>
        </form>
      )}
      {isAdmin && createPeriodError && (
        <p className="-mt-2 md:-mt-4 text-xs text-red-600 dark:text-red-400">{createPeriodError}</p>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400 dark:text-slate-400">데이터를 불러오는 중...</div>
      ) : ledgers.length > 0 ? (
        <div className="flex flex-col bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
          {ledgers.map((ledger) => (
            <div
              key={ledger.id}
              className="flex items-center gap-2 px-3 md:px-4 py-2.5 md:py-3 border-b last:border-b-0 border-gray-100 dark:border-slate-700 hover:bg-teal-50/40 dark:hover:bg-teal-900/20"
            >
              <Link to={`/admin/meetups/${ledger.id}`} className="flex-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${
                      ledger.status === 'closed'
                        ? 'bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-slate-300'
                        : 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300'
                    }`}
                  >
                    {ledger.status === 'closed' ? '정산 완료' : '진행 중'}
                  </span>
                  <span className="font-medium text-gray-800 dark:text-slate-200 truncate text-sm md:text-base">{ledger.title}</span>
                  {ledger.shareEnabled && (
                    <Globe size={14} className="shrink-0 text-teal-600 dark:text-teal-400" aria-label="공개 중" />
                  )}
                </div>
                <div className="text-xs text-gray-400 dark:text-slate-400 mt-0.5 truncate">
                  {formatPeriod(ledger.meetupDate, ledger.meetupEndDate)} · {ledgerSubtitle(ledger)}
                </div>
              </Link>
              {isAdmin && (
                <button
                  onClick={() => handleDelete(ledger)}
                  disabled={deletingId === ledger.id}
                  className="px-2 py-1 bg-red-50 dark:bg-red-900/40 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 text-xs font-medium rounded transition-colors disabled:opacity-50 shrink-0"
                >
                  {deletingId === ledger.id ? '삭제 중' : '삭제'}
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-gray-400 dark:text-slate-400 border border-dashed border-gray-300 dark:border-slate-600 rounded-lg">
          {canEdit ? '표시할 모임이 없습니다.' : '내가 총무인 모임이 없습니다.'}
        </div>
      )}

      {isAdmin && (
        <div>
          <button
            onClick={toggleDeleted}
            className="flex items-center gap-1 text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
          >
            {showDeleted ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            삭제된 모임
          </button>
          {showDeleted && (
            <div className="mt-2">
              {deleted === null ? (
                <div className="text-sm text-gray-400 dark:text-slate-400 py-2">데이터를 불러오는 중...</div>
              ) : deleted.length === 0 ? (
                <div className="text-sm text-gray-400 dark:text-slate-400 py-2">삭제된 모임이 없습니다.</div>
              ) : (
                <div className="flex flex-col bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
                  {deleted.map((ledger) => (
                    <div
                      key={ledger.id}
                      className="flex items-center gap-2 px-3 md:px-4 py-2.5 border-b last:border-b-0 border-gray-100 dark:border-slate-700"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-600 dark:text-slate-300 truncate">{ledger.title}</div>
                        <div className="text-xs text-gray-400 dark:text-slate-500">
                          삭제일 {ledger.deletedAt ? new Date(ledger.deletedAt).toLocaleDateString('ko-KR') : '-'}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRestore(ledger)}
                        disabled={restoringId === ledger.id}
                        className="px-2 py-1 bg-green-50 dark:bg-green-900/40 hover:bg-green-100 dark:hover:bg-green-900/50 text-green-700 dark:text-green-300 text-xs font-medium rounded transition-colors disabled:opacity-50 shrink-0"
                      >
                        {restoringId === ledger.id ? '복원 중' : '복원'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showTreasurerPicker && (
        <MemberPickerModal
          treasurers
          title="총무 지정"
          initialSelected={treasurers.map((t) => t.id)}
          addedUserIds={new Set()}
          onClose={() => setShowTreasurerPicker(false)}
          onAdd={setTreasurers}
        />
      )}
    </div>
  );
}
