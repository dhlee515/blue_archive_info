import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useBlocker, useParams } from 'react-router';
import { AlertTriangle, ArrowLeft, Check, Copy, Plus, RefreshCw, Trash2, UserCog, UserPlus } from 'lucide-react';
import {
  TREASURY,
  type MeetupExpense,
  type MeetupExpenseCategory,
  type MeetupFeeTier,
  type MeetupLedger,
  type MeetupLedgerData,
  type MeetupLedgerStatus,
  type MeetupParticipant,
} from '@/types/meetup';
import { MeetupRepository } from '@/repositories/meetupRepository';
import NumberInput from '@/components/form/NumberInput';
import { AppError } from '@/utils/AppError';
import { useAuthStore, useIsAdmin } from '@/stores/authStore';
import { newId } from '@/utils/id';
import {
  CATEGORY_LABELS,
  EXPENSE_CATEGORIES,
  buildPublicSnapshot,
  buildShareText,
  computeSettlement,
  expenseSharers,
  isEvent,
  needsTreasurer,
  normalizePeriod,
  periodError,
  surplusText,
  toggleAbsent,
  validateLedger,
  won,
} from '@/service/meetup/utils/meetupSettlement';
import { BalanceList, SectionCard, SummaryGrid, TransferList } from '@/service/meetup/components/SettlementSections';
import MemberPickerModal from '@/service/meetup/components/MemberPickerModal';
import type { UserProfile } from '@/types/auth';

const inputCls =
  'p-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-slate-100 text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none disabled:opacity-60';
const errorRing = 'ring-2 ring-red-400 dark:ring-red-500';
const smallBtn =
  'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50';

export default function MeetupLedgerPage() {
  const { id } = useParams<{ id: string }>();
  /** 편집 = 최고 관리자 + 이 모임의 총무. 그 외 (부관리자) 는 열람만 — RLS · 트리거도 동일 */
  const isAdmin = useIsAdmin();
  const userId = useAuthStore((s) => s.user?.id ?? null);
  /** 마지막으로 저장된 상태 (미저장 판정 기준 + 낙관적 잠금 토큰) */
  const [ledger, setLedger] = useState<MeetupLedger | null>(null);
  const [title, setTitle] = useState('');
  /** 기간 입력값 (YYYY-MM-DD, 빈 문자열 = 없음). 저장 시 normalizePeriod 로 변환 */
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [data, setData] = useState<MeetupLedgerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [copied, setCopied] = useState<'link' | 'text' | null>(null);
  const [account, setAccount] = useState('');
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  /** 편집 권한 총무들 (최고 관리자만 변경, 저장 시 반영) */
  const [treasurerIds, setTreasurerIds] = useState<string[]>([]);
  const [showTreasurerPicker, setShowTreasurerPicker] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchData() {
      if (!id) return;
      try {
        const l = await MeetupRepository.getLedgerById(id);
        setLedger(l);
        setTitle(l.title);
        setStartDate(l.meetupDate ?? '');
        setEndDate(l.meetupEndDate ?? '');
        setData(l.data);
        setTreasurerIds(l.treasurerUserIds);
      } catch (error) {
        console.error('Failed to fetch ledger:', error);
        setLoadError(error instanceof AppError ? error.message : '모임 장부를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [id]);

  const isDirty = useMemo(() => {
    if (!ledger || !data) return false;
    return (
      title !== ledger.title
      || normalizePeriod(startDate, endDate).meetupDate !== ledger.meetupDate
      || normalizePeriod(startDate, endDate).meetupEndDate !== ledger.meetupEndDate
      || JSON.stringify(data) !== JSON.stringify(ledger.data)
      || JSON.stringify(treasurerIds) !== JSON.stringify(ledger.treasurerUserIds)
    );
  }, [ledger, data, title, startDate, endDate, treasurerIds]);

  // 이탈 경고: 새로고침 / 탭 닫기
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // 이탈 경고: 앱 내 라우터 이동
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => isDirty && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (confirm('저장하지 않은 변경이 있습니다. 페이지를 나가시겠습니까?')) blocker.proceed();
    else blocker.reset();
  }, [blocker]);

  useEffect(() => {
    if (!savedFlash) return;
    const t = setTimeout(() => setSavedFlash(false), 2000);
    return () => clearTimeout(t);
  }, [savedFlash]);

  const issues = useMemo(() => (data ? validateLedger(data, treasurerIds) : []), [data, treasurerIds]);
  const result = useMemo(() => (data ? computeSettlement(data) : null), [data]);
  const snapshot = useMemo(() => (data && result ? buildPublicSnapshot(data, result) : null), [data, result]);
  const issueIds = useMemo(() => new Set(issues.map((i) => i.target?.id).filter(Boolean)), [issues]);
  const treasurerIssue = issues.some((i) => i.target?.kind === 'treasurer');

  if (loading) {
    return <div className="text-center py-12 text-gray-400 dark:text-slate-400">데이터를 불러오는 중...</div>;
  }
  if (!ledger || !data || !result || !snapshot) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 dark:text-slate-400 mb-4">{loadError ?? '모임 장부를 찾을 수 없습니다.'}</p>
        <Link to="/admin/meetups" className="text-blue-600 dark:text-blue-400 hover:underline">목록으로</Link>
      </div>
    );
  }

  /** 이 모임의 총무 본인 (최고 관리자가 아닐 때 의미) */
  const isLedgerTreasurer = !!userId && ledger.treasurerUserIds.includes(userId);
  const readOnly = !isAdmin && !isLedgerTreasurer;
  const isTreasurerRow = (p: MeetupParticipant) => !!p.userId && treasurerIds.includes(p.userId);
  const locked = ledger.status === 'closed' || readOnly;
  const period = normalizePeriod(startDate, endDate);
  const periodErr = periodError(startDate, endDate);
  const canSave = !saving && issues.length === 0 && title.trim() !== '' && !periodErr;
  const hasTreasurer = !!data.treasurerId;
  /** 참석자끼리 나누는 지출 (고기 1차 · 노래방 2차 …) — 참가자 행에서 참석 칩으로도 보여 준다 */
  const events = data.expenses.filter(isEvent);
  const pName = (pid: string) => data.participants.find((p) => p.id === pid)?.name.trim() || '(이름 없음)';

  const update = (fn: (d: MeetupLedgerData) => MeetupLedgerData) => setData((d) => (d ? fn(d) : d));

  // ── 참가비 구간 ──
  const addTier = () =>
    update((d) => ({ ...d, feeTiers: [...d.feeTiers, { id: newId(), label: '', amount: 0 }] }));
  const updateTier = (tid: string, patch: Partial<MeetupFeeTier>) =>
    update((d) => ({ ...d, feeTiers: d.feeTiers.map((t) => (t.id === tid ? { ...t, ...patch } : t)) }));
  const removeTier = (tid: string) => {
    const used = data.participants.filter((p) => p.feeTierId === tid).length;
    if (used > 0 && !confirm(`${used}명이 이 구간을 쓰고 있습니다. 삭제하면 이 사람들은 '참가비 없음'으로 바뀝니다.`)) return;
    update((d) => ({
      ...d,
      feeTiers: d.feeTiers.filter((t) => t.id !== tid),
      participants: d.participants.map((p) => (p.feeTierId === tid ? { ...p, feeTierId: null } : p)),
    }));
  };

  // ── 참가자 ──
  /** 회원을 참가자로 추가. 닉네임은 추가 시점 값을 복사하고, 장부 안에서 겹치면 " (2)" 를 붙인다 (회원가입 시 닉네임 중복을 막지 않음) */
  const addMembers = (members: UserProfile[]) => {
    const taken = new Set(data.participants.map((p) => p.name.trim()));
    const uniqueName = (nickname: string) => {
      const base = nickname.trim() || '(닉네임 없음)';
      let name = base;
      for (let k = 2; taken.has(name); k++) name = `${base} (${k})`;
      taken.add(name);
      return name;
    };
    const defaultTier = data.feeTiers[0]?.id ?? null;
    const added: MeetupParticipant[] = members.map((m) => ({
      id: newId(),
      userId: m.id,
      name: uniqueName(m.nickname),
      feeTierId: defaultTier,
      feePaid: false,
      settledAmount: null,
      memo: '',
    }));
    // 기존 이벤트에는 자동으로 참석 (빠진 사람만 저장하므로 따로 할 일 없음)
    update((d) => ({ ...d, participants: [...d.participants, ...added] }));
  };
  /** 총무 임명 (최고 관리자). 참가자가 아닌 총무는 참가자로 추가하고, 정산 총무가 총무가 아니게 되면 첫 총무로 바꾼다 */
  const applyTreasurers = (members: UserProfile[]) => {
    const ids = members.map((m) => m.id);
    setTreasurerIds(ids);
    const missing = members.filter((m) => !data.participants.some((p) => p.userId === m.id));
    if (missing.length > 0) addMembers(missing);
    update((d) => {
      const current = d.participants.find((p) => p.id === d.treasurerId);
      if (current?.userId && ids.includes(current.userId)) return d;
      const first = ids.map((uid) => d.participants.find((p) => p.userId === uid)).find(Boolean);
      return first ? { ...d, treasurerId: first.id } : d;
    });
  };
  const updateParticipant = (pid: string, patch: Partial<MeetupParticipant>) =>
    update((d) => ({ ...d, participants: d.participants.map((p) => (p.id === pid ? { ...p, ...patch } : p)) }));
  const removeParticipant = (pid: string) => {
    const paidCount = data.expenses.filter((e) => e.paidBy === pid).length;
    const msg = paidCount > 0
      ? `${pName(pid)}: 이 참가자가 결제한 지출이 ${paidCount}건 있습니다.\n삭제하면 결제자가 '모임 통장'으로 바뀌고 분담 대상에서도 빠집니다. 삭제하시겠습니까?`
      : `${pName(pid)} 참가자를 삭제하시겠습니까?`;
    if (!confirm(msg)) return;
    update((d) => ({
      ...d,
      treasurerId: d.treasurerId === pid ? null : d.treasurerId,
      participants: d.participants.filter((p) => p.id !== pid),
      expenses: d.expenses.map((e) => ({
        ...e,
        paidBy: e.paidBy === pid ? TREASURY : e.paidBy,
        cover: e.cover.kind === 'event' ? { kind: 'event', absent: e.cover.absent.filter((x) => x !== pid) } : e.cover,
      })),
    }));
  };

  // ── 지출 ──
  const addExpense = () => {
    const expense: MeetupExpense = {
      id: newId(),
      label: '',
      category: 'etc',
      amount: 0,
      paidBy: hasTreasurer ? TREASURY : (data.participants[0]?.id ?? TREASURY),
      // 참석자 분담은 전원 참석으로 시작 — 안 간 사람만 뺀다
      cover: data.feeTiers.length > 0 ? { kind: 'fee' } : { kind: 'event', absent: [] },
      memo: '',
    };
    update((d) => ({ ...d, expenses: [...d.expenses, expense] }));
  };
  const updateExpense = (eid: string, patch: Partial<MeetupExpense>) =>
    update((d) => ({ ...d, expenses: d.expenses.map((e) => (e.id === eid ? { ...e, ...patch } : e)) }));
  const removeExpense = (e: MeetupExpense) => {
    if ((e.label.trim() || e.amount > 0) && !confirm(`"${e.label.trim() || '이름 없는 지출'}" 지출을 삭제하시겠습니까?`)) return;
    update((d) => ({ ...d, expenses: d.expenses.filter((x) => x.id !== e.id) }));
  };
  /** 이벤트 참석 ↔ 불참 (지출 카드 · 참가자 행 어느 쪽에서 눌러도 같음) */
  const toggleAttend = (eid: string, pid: string) =>
    update((d) => ({ ...d, expenses: d.expenses.map((x) => (x.id === eid ? toggleAbsent(d, x, pid) : x)) }));
  const eventName = (e: MeetupExpense) => e.label.trim() || '(이름 없는 지출)';

  // ── 정산 완료 체크 (hub 전용) ──
  const toggleSettled = (index: number) => {
    const row = result.rows[index];
    const p = data.participants[index];
    if (!row || !p || row.isTreasurer) return;
    updateParticipant(p.id, { settledAmount: p.settledAmount === null ? row.balance : null });
  };

  // ── 저장 · 상태 ──
  const handleSave = async (nextStatus?: MeetupLedgerStatus) => {
    if (!id || !canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await MeetupRepository.updateLedger(
        id,
        {
          title: title.trim(),
          ...period,
          status: nextStatus ?? ledger.status,
          data,
          // 총무 임명 · 해제는 최고 관리자만 (비관리자가 보내면 DB 트리거가 거부)
          ...(isAdmin ? { treasurerUserIds: treasurerIds } : {}),
        },
        ledger.updatedAt,
      );
      setLedger(saved);
      setTreasurerIds(saved.treasurerUserIds);
      setTitle(saved.title);
      setStartDate(saved.meetupDate ?? '');
      setEndDate(saved.meetupEndDate ?? '');
      setData(saved.data);
      setSavedFlash(true);
    } catch (error) {
      console.error('Failed to save ledger:', error);
      if (error instanceof AppError && (error.code === 'CONFLICT' || error.code === 'NOT_FOUND')) {
        setSaveError(error.message);
      } else {
        alert('저장에 실패했습니다.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleStatus = (next: MeetupLedgerStatus) => {
    if (next === 'closed' && !confirm('정산 완료로 바꾸면 장부 편집이 잠깁니다. (다시 열기 가능)')) return;
    handleSave(next);
  };

  // ── 공개 ──
  const shareUrl = `${window.location.origin}/m/${ledger.slug}`;
  const handleShareToggle = async () => {
    if (!id) return;
    setShareBusy(true);
    setSaveError(null);
    try {
      const r = await MeetupRepository.setShareEnabled(id, !ledger.shareEnabled, ledger.updatedAt);
      setLedger({ ...ledger, shareEnabled: r.shareEnabled, updatedAt: r.updatedAt });
    } catch (error) {
      console.error('Failed to toggle share:', error);
      if (error instanceof AppError && (error.code === 'CONFLICT' || error.code === 'NOT_FOUND')) setSaveError(error.message);
      else alert('공개 설정 변경에 실패했습니다.');
    } finally {
      setShareBusy(false);
    }
  };
  const handleRegenerate = async () => {
    if (!id || !confirm('기존 링크가 즉시 막힙니다. 새 링크를 발급하시겠습니까?')) return;
    setShareBusy(true);
    setSaveError(null);
    try {
      const r = await MeetupRepository.regenerateSlug(id, ledger.updatedAt);
      setLedger({ ...ledger, slug: r.slug, updatedAt: r.updatedAt });
    } catch (error) {
      console.error('Failed to regenerate slug:', error);
      if (error instanceof AppError && (error.code === 'CONFLICT' || error.code === 'NOT_FOUND')) setSaveError(error.message);
      else alert('링크 재발급에 실패했습니다.');
    } finally {
      setShareBusy(false);
    }
  };
  const copy = async (kind: 'link' | 'text', text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied((c) => (c === kind ? null : c)), 1500);
    } catch (error) {
      console.error('Failed to copy:', error);
      alert('복사에 실패했습니다.');
    }
  };

  const shareText = issues.length === 0 ? buildShareText(title, period.meetupDate, period.meetupEndDate, data, result, account) : '';

  const saveLabel = saving ? '저장 중...' : savedFlash && !isDirty ? '저장됨' : '저장';

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-4 md:gap-6 pb-24 md:pb-0">
      {/* 헤더 */}
      <div className="flex flex-col gap-3">
        <Link to="/admin/meetups" className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 w-fit">
          <ArrowLeft size={16} /> 모임 목록
        </Link>
        <div className="flex flex-col md:flex-row md:items-center gap-2">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={locked}
            placeholder="모임 이름"
            className={`flex-1 min-w-0 text-xl md:text-2xl font-extrabold text-blue-900 dark:text-blue-300 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-teal-500 dark:hover:border-slate-600 focus:outline-none py-1 disabled:opacity-80 ${title.trim() ? '' : 'border-red-400'}`}
          />
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={locked} aria-label="시작일" className={inputCls} />
              <span className="text-gray-400 dark:text-slate-500">~</span>
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={locked}
                aria-label="끝일 (하루 모임이면 비워 두세요)"
                title="하루 모임이면 비워 두세요"
                className={`${inputCls} ${periodErr ? errorRing : ''}`}
              />
            </div>
            {readOnly ? null : ledger.status === 'closed' ? (
              <button onClick={() => handleStatus('open')} disabled={saving} className={`${smallBtn} bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-200 hover:bg-gray-200 dark:hover:bg-slate-600`}>
                다시 열기
              </button>
            ) : (
              <button onClick={() => handleStatus('closed')} disabled={!canSave} className={`${smallBtn} bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-200 hover:bg-gray-200 dark:hover:bg-slate-600`}>
                정산 완료 처리
              </button>
            )}
            {!readOnly && (
              <button
                onClick={() => handleSave()}
                disabled={!canSave || !isDirty}
                className="hidden md:inline-flex items-center gap-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold py-2 px-4 rounded-lg transition-colors text-sm"
              >
                {savedFlash && !isDirty && <Check size={16} />}
                {saveLabel}
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span
            className={`font-medium px-1.5 py-0.5 rounded ${
              ledger.status === 'closed' ? 'bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-slate-300' : 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300'
            }`}
          >
            {ledger.status === 'closed' ? (readOnly ? '정산 완료' : '정산 완료 — 편집 잠김') : '진행 중'}
          </span>
          {readOnly && (
            <span className="font-medium px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
              열람 전용 — 수정은 최고 관리자와 이 모임의 총무만 가능합니다
            </span>
          )}
          {!isAdmin && isLedgerTreasurer && (
            <span className="font-medium px-1.5 py-0.5 rounded bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300">
              총무 — 이 모임을 편집할 수 있습니다
            </span>
          )}
          {isDirty && <span className="text-amber-600 dark:text-amber-400">● 저장하지 않은 변경</span>}
          {periodErr && <span className="text-red-600 dark:text-red-400">{periodErr}</span>}
        </div>
      </div>

      {saveError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/30 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>{saveError} 지금 편집 내용은 화면에 남아 있습니다. 정산 문구 복사 등으로 옮긴 뒤 새로고침하세요.</span>
        </div>
      )}

      {issues.length > 0 && (
        <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          <div className="font-bold mb-1">입력 오류 {issues.length}건 — 고칠 때까지 저장할 수 없습니다.</div>
          <ul className="list-disc pl-5 flex flex-col gap-0.5">
            {issues.map((i, k) => <li key={k}>{i.message}</li>)}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem] gap-4 md:gap-6 items-start">
        {/* 왼쪽: 입력 */}
        <fieldset disabled={locked} className="min-w-0 flex flex-col gap-4 md:gap-6 border-0 p-0 m-0">
          {/* 참가비 구간 */}
          <SectionCard
            title="참가비 구간"
            right={<button type="button" onClick={addTier} className={`${smallBtn} bg-teal-600 hover:bg-teal-700 text-white`}><Plus size={14} />구간</button>}
          >
            {data.feeTiers.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-slate-400">참가비가 없는 모임(더치페이만)이면 비워 두세요.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {data.feeTiers.map((t) => (
                  <div key={t.id} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={t.label}
                      onChange={(e) => updateTier(t.id, { label: e.target.value })}
                      placeholder="구간 이름 (예: 1차)"
                      className={`${inputCls} flex-1 min-w-0 ${issueIds.has(t.id) ? errorRing : ''}`}
                    />
                    <NumberInput value={t.amount} onChange={(n) => updateTier(t.id, { amount: n })} zeroAsEmpty placeholder="금액" className={`${inputCls} w-28 text-right tabular-nums`} />
                    <span className="text-sm text-gray-500 dark:text-slate-400">원</span>
                    <button type="button" onClick={() => removeTier(t.id)} className="p-1.5 text-gray-400 hover:text-red-500" aria-label="구간 삭제"><Trash2 size={16} /></button>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* 참가자 */}
          <SectionCard
            title={`참가자 ${data.participants.length}명`}
            right={<button type="button" onClick={() => setShowMemberPicker(true)} className={`${smallBtn} bg-teal-600 hover:bg-teal-700 text-white`}><UserPlus size={14} />회원 추가</button>}
          >
            <div className="flex flex-col gap-3">
              {data.participants.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-slate-400">
                  '회원 추가'에서 사이트 회원을 골라 참가자로 등록하세요. 가입하지 않은 사람은 먼저 가입을 안내하세요.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="font-medium text-gray-600 dark:text-slate-300">총무</span>
                {treasurerIds.length === 0 ? (
                  <span className="text-gray-400 dark:text-slate-500">미지정 — 최고 관리자만 편집할 수 있습니다</span>
                ) : (
                  treasurerIds.map((uid) => (
                    <span key={uid} className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                      {data.participants.find((p) => p.userId === uid)?.name ?? '(참가자 아님)'}
                    </span>
                  ))
                )}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setShowTreasurerPicker(true)}
                    className="inline-flex items-center gap-1 text-teal-700 dark:text-teal-300 hover:underline ml-1"
                  >
                    <UserCog size={13} />총무 변경
                  </button>
                )}
              </div>
              {treasurerIssue && (
                <p className="text-xs text-red-600 dark:text-red-400">정산 총무(◉ 정산)를 지정하세요.</p>
              )}
              {!readOnly && data.participants.length > 0 && (
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  총무는 이 모임을 편집할 수 있고(임명 · 해제는 최고 관리자만), ◉ 정산은 송금을 받는 대표 총무입니다.
                  총무를 참가자에서 빼려면 먼저 총무에서 해제하세요.
                </p>
              )}
              {data.participants.map((p) => (
                <div
                  key={p.id}
                  className={`flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 dark:border-slate-700 p-2 ${issueIds.has(p.id) ? errorRing : ''}`}
                >
                  {p.userId ? (
                    <span className="flex-1 min-w-[7rem] flex items-center gap-1.5 px-1 text-sm font-medium text-gray-800 dark:text-slate-100">
                      <span className="truncate">{p.name}</span>
                      <span className="shrink-0 text-[10px] font-normal px-1.5 py-0.5 rounded bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300">회원</span>
                      {isTreasurerRow(p) && (
                        <span className="shrink-0 text-[10px] font-normal px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">총무</span>
                      )}
                    </span>
                  ) : (
                    // 회원 연결 이전에 직접 입력한 참가자 (기존 데이터)
                    <span className="flex-1 min-w-[7rem] flex items-center gap-1.5">
                      <input
                        type="text"
                        value={p.name}
                        onChange={(e) => updateParticipant(p.id, { name: e.target.value })}
                        placeholder="닉네임"
                        className={`${inputCls} flex-1 min-w-0`}
                      />
                      <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400" title="회원 연결 기능 이전에 직접 입력한 참가자">비회원</span>
                    </span>
                  )}
                  {data.feeTiers.length > 0 && (
                    <select
                      value={p.feeTierId ?? ''}
                      onChange={(e) => updateParticipant(p.id, { feeTierId: e.target.value || null })}
                      className={inputCls}
                    >
                      <option value="">참가비 없음</option>
                      {data.feeTiers.map((t) => (
                        <option key={t.id} value={t.id}>{t.label || '(이름 없음)'} {t.amount.toLocaleString('ko-KR')}</option>
                      ))}
                    </select>
                  )}
                  {p.feeTierId && (
                    <label className="inline-flex items-center gap-1 text-xs text-gray-700 dark:text-slate-300" title="정산 전에 참가비를 미리 냈으면 체크">
                      <input type="checkbox" checked={p.feePaid} onChange={(e) => updateParticipant(p.id, { feePaid: e.target.checked })} />
                      선납
                    </label>
                  )}
                  {/* ◉ 정산 = 송금 받는 대표 총무. 총무가 임명돼 있으면 총무 중에서만, 아니면(이전 장부) 최고 관리자가 아무나 */}
                  {(treasurerIds.length === 0 || isTreasurerRow(p)) && (
                    <label className="inline-flex items-center gap-1 text-xs text-gray-700 dark:text-slate-300" title="정산 송금을 받는 대표 총무">
                      <input
                        type="radio"
                        name="treasurer"
                        checked={data.treasurerId === p.id}
                        disabled={treasurerIds.length === 0 && !isAdmin}
                        onChange={() => update((d) => ({ ...d, treasurerId: p.id }))}
                      />
                      정산
                    </label>
                  )}
                  <input
                    type="text"
                    value={p.memo}
                    onChange={(e) => updateParticipant(p.id, { memo: e.target.value })}
                    placeholder="메모 (비공개)"
                    className={`${inputCls} flex-1 min-w-[8rem] text-xs`}
                  />
                  {/* 총무는 먼저 총무에서 해제해야 뺄 수 있음. 정산 총무(이전 장부)는 최고 관리자만 */}
                  {!isTreasurerRow(p) && (isAdmin || p.id !== data.treasurerId) && (
                    <button type="button" onClick={() => removeParticipant(p.id)} className="p-1.5 text-gray-400 hover:text-red-500" aria-label="참가자 삭제"><Trash2 size={16} /></button>
                  )}
                  {events.length > 0 && (
                    <div className="basis-full flex flex-wrap items-center gap-1.5 text-xs text-gray-600 dark:text-slate-300">
                      <span className="font-medium mr-0.5">참석</span>
                      {events.map((e) => {
                        const on = e.cover.kind === 'event' && !e.cover.absent.includes(p.id);
                        return (
                          <button
                            key={e.id}
                            type="button"
                            aria-pressed={on}
                            onClick={() => toggleAttend(e.id, p.id)}
                            title={on ? '누르면 불참으로' : '누르면 참석으로'}
                            className={`px-2 py-0.5 rounded-full border transition-colors ${on ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white dark:bg-slate-800 border-gray-300 dark:border-slate-600 text-gray-400 dark:text-slate-500 line-through'}`}
                          >
                            {eventName(e)}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </SectionCard>

          {/* 지출 */}
          <SectionCard
            title={`지출 · 이벤트 ${data.expenses.length}건 · ${won(result.summary.totalExpense)}`}
            right={<button type="button" onClick={addExpense} className={`${smallBtn} bg-teal-600 hover:bg-teal-700 text-white`}><Plus size={14} />지출</button>}
          >
            {data.expenses.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-slate-400">
                고기 1차 · 노래방 2차 · 대관비처럼 쓴 돈을 추가하세요. 참석자끼리 나누는 지출은 전원 참석으로 시작하니, 안 간 사람만 빼면 됩니다.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {data.expenses.map((e) => (
                  <div key={e.id} className={`flex flex-col gap-2 rounded-lg border border-gray-200 dark:border-slate-700 p-2 ${issueIds.has(e.id) ? errorRing : ''}`}>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={e.label}
                        onChange={(ev) => updateExpense(e.id, { label: ev.target.value })}
                        placeholder="항목 (예: 고기 1차)"
                        className={`${inputCls} flex-1 min-w-0`}
                      />
                      <NumberInput value={e.amount} onChange={(n) => updateExpense(e.id, { amount: n })} zeroAsEmpty placeholder="금액" className={`${inputCls} w-28 text-right tabular-nums`} />
                      <button type="button" onClick={() => removeExpense(e)} className="p-1.5 text-gray-400 hover:text-red-500" aria-label="지출 삭제"><Trash2 size={16} /></button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-slate-300">
                      <select value={e.category} onChange={(ev) => updateExpense(e.id, { category: ev.target.value as MeetupExpenseCategory })} className={inputCls}>
                        {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                      </select>
                      <label className="inline-flex items-center gap-1">
                        결제
                        <select value={e.paidBy} onChange={(ev) => updateExpense(e.id, { paidBy: ev.target.value })} className={inputCls}>
                          <option value={TREASURY}>모임 통장</option>
                          {data.participants.map((p) => <option key={p.id} value={p.id}>{p.name.trim() || '(이름 없음)'}</option>)}
                        </select>
                      </label>
                      <label className="inline-flex items-center gap-1">
                        충당
                        <select
                          value={e.cover.kind}
                          onChange={(ev) =>
                            updateExpense(e.id, { cover: ev.target.value === 'fee' ? { kind: 'fee' } : { kind: 'event', absent: [] } })
                          }
                          className={inputCls}
                        >
                          <option value="event">참석자끼리 분담</option>
                          <option value="fee">회비에서</option>
                        </select>
                      </label>
                    </div>
                    {e.cover.kind === 'event' && (() => {
                      const n = expenseSharers(data, e).length;
                      const absent = e.cover.absent;
                      return (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-gray-500 dark:text-slate-400 mr-1 tabular-nums">
                            참석 {n}/{data.participants.length}명
                            {n > 0 && e.amount > 0 && <> · 1인 {e.amount % n === 0 ? '' : '약 '}{won(Math.floor(e.amount / n))}</>}
                          </span>
                          {absent.length > 0 && (
                            <button type="button" onClick={() => updateExpense(e.id, { cover: { kind: 'event', absent: [] } })} className="text-xs text-teal-700 dark:text-teal-300 hover:underline mr-1">
                              전원 참석
                            </button>
                          )}
                          {data.participants.map((p) => {
                            const on = !absent.includes(p.id);
                            return (
                              <button
                                key={p.id}
                                type="button"
                                aria-pressed={on}
                                onClick={() => toggleAttend(e.id, p.id)}
                                title={on ? '누르면 불참으로' : '누르면 참석으로'}
                                className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${on ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white dark:bg-slate-800 border-gray-300 dark:border-slate-600 text-gray-400 dark:text-slate-500 line-through'}`}
                              >
                                {p.name.trim() || '(이름 없음)'}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })()}
                    <input
                      type="text"
                      value={e.memo}
                      onChange={(ev) => updateExpense(e.id, { memo: ev.target.value })}
                      placeholder="메모 (비공개)"
                      className={`${inputCls} text-xs`}
                    />
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* 정산 설정 */}
          <SectionCard title="정산 설정">
            <div className="flex flex-col gap-3 text-sm text-gray-700 dark:text-slate-300">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="text-xs font-medium text-gray-500 dark:text-slate-400 w-24">회비가 남으면</span>
                <label className="inline-flex items-center gap-1"><input type="radio" name="surplus" checked={data.surplusMode === 'carry'} onChange={() => update((d) => ({ ...d, surplusMode: 'carry' }))} />이월 (통장 보관)</label>
                <label className="inline-flex items-center gap-1"><input type="radio" name="surplus" checked={data.surplusMode === 'refund'} onChange={() => update((d) => ({ ...d, surplusMode: 'refund' }))} />참가비 비례 환급</label>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="text-xs font-medium text-gray-500 dark:text-slate-400 w-24">회비가 모자라면</span>
                <label className="inline-flex items-center gap-1"><input type="radio" name="deficit" checked={data.deficitMode === 'collect'} onChange={() => update((d) => ({ ...d, deficitMode: 'collect' }))} />참가비 비례 추가 징수</label>
                <label className="inline-flex items-center gap-1"><input type="radio" name="deficit" checked={data.deficitMode === 'absorb'} onChange={() => update((d) => ({ ...d, deficitMode: 'absorb' }))} />총무 부담</label>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="text-xs font-medium text-gray-500 dark:text-slate-400 w-24">송금 방식</span>
                <label className="inline-flex items-center gap-1"><input type="radio" name="transfer" disabled={!hasTreasurer} checked={result.transferMode === 'hub'} onChange={() => update((d) => ({ ...d, transferMode: 'hub' }))} />총무 경유</label>
                <label className="inline-flex items-center gap-1"><input type="radio" name="transfer" disabled={!hasTreasurer} checked={result.transferMode === 'min'} onChange={() => update((d) => ({ ...d, transferMode: 'min' }))} />송금 건수 줄이기</label>
              </div>
              {!hasTreasurer && !needsTreasurer(data) && (
                <p className="text-xs text-gray-500 dark:text-slate-400">총무가 없는 장부는 '송금 건수 줄이기'로 계산합니다.</p>
              )}
            </div>
          </SectionCard>

          {/* 사람별 정산 */}
          <SectionCard title="사람별 정산">
            {issues.length > 0 ? (
              <p className="text-sm text-amber-700 dark:text-amber-300">입력 오류를 먼저 고치세요.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {result.transferMode === 'hub' ? (
                  <p className="text-xs text-gray-500 dark:text-slate-400">
                    송금을 마친 사람은 '완료'를 체크하세요. 이후 금액이 바뀌면 차액만 송금 목록에 남습니다.
                  </p>
                ) : result.ignoredSettled ? (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    정산 완료 기록은 '총무 경유' 방식에서만 반영됩니다. 지금 송금 목록은 완료 기록을 무시하고 계산했습니다.
                  </p>
                ) : null}
                <BalanceList
                  rows={snapshot.participants}
                  renderAction={(i) => {
                    const row = result.rows[i];
                    if (!row) return null;
                    if (row.isTreasurer) return null;
                    return (
                      <label className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-slate-300">
                        <input
                          type="checkbox"
                          checked={data.participants[i]?.settledAmount !== null}
                          disabled={result.transferMode !== 'hub'}
                          onChange={() => toggleSettled(i)}
                        />
                        완료
                      </label>
                    );
                  }}
                />
                {!result.balanced && (
                  <p className="text-xs text-red-600 dark:text-red-400">계산 합계가 맞지 않습니다. (버그 — 관리자에게 알려 주세요)</p>
                )}
              </div>
            )}
          </SectionCard>
        </fieldset>

        {/* 오른쪽: 결과 · 공유 */}
        <div ref={resultRef} className="flex flex-col gap-4 md:gap-6 lg:sticky lg:top-4 scroll-mt-20">
          <SectionCard title="요약">
            <SummaryGrid summary={result.summary} />
          </SectionCard>

          <SectionCard title={`송금 ${issues.length > 0 ? '-' : result.transfers.length}건`}>
            {issues.length > 0 ? (
              <p className="text-sm text-amber-700 dark:text-amber-300">입력 오류를 먼저 고치세요.</p>
            ) : (
              <div className="flex flex-col gap-3">
                <TransferList transfers={snapshot.transfers} />
                <input
                  type="text"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  placeholder="송금 계좌 (문구에만 붙음, 저장 안 함)"
                  className={`${inputCls} text-xs`}
                />
                <textarea readOnly value={shareText} rows={6} className={`${inputCls} text-xs font-mono resize-y`} />
                <button
                  type="button"
                  onClick={() => copy('text', shareText)}
                  className={`${smallBtn} justify-center py-2 ${copied === 'text' ? 'bg-green-50 dark:bg-green-900/40 text-green-700 dark:text-green-300' : 'bg-teal-50 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/60'}`}
                >
                  {copied === 'text' ? <Check size={14} /> : <Copy size={14} />}
                  {copied === 'text' ? '복사됨!' : '정산 문구 복사'}
                </button>
              </div>
            )}
          </SectionCard>

          <SectionCard title="공개 결산 링크">
            <div className="flex flex-col gap-2 text-sm">
              <label className="inline-flex items-center gap-2 text-gray-700 dark:text-slate-300">
                <input type="checkbox" checked={ledger.shareEnabled} disabled={shareBusy || readOnly} onChange={handleShareToggle} />
                링크로 결산 공개{readOnly && <span className="text-xs text-gray-400 dark:text-slate-500">(관리자만 변경)</span>}
              </label>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                링크를 아는 사람은 로그인 없이 요약 · 송금 목록 · 지출 내역을 볼 수 있습니다. 메모는 공개되지 않으며,
                <b> 마지막으로 저장한 내용</b>이 보입니다.
              </p>
              <div className="flex items-center gap-1.5 min-w-0">
                <code className={`flex-1 min-w-0 truncate text-xs px-2 py-1.5 rounded bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 ${ledger.shareEnabled ? 'text-gray-700 dark:text-slate-300' : 'text-gray-400 dark:text-slate-500 line-through'}`}>
                  /m/{ledger.slug}
                </code>
                <button
                  type="button"
                  onClick={() => copy('link', shareUrl)}
                  disabled={!ledger.shareEnabled}
                  className={`${smallBtn} ${copied === 'link' ? 'bg-green-50 dark:bg-green-900/40 text-green-700 dark:text-green-300' : 'bg-teal-50 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 hover:bg-teal-100'}`}
                >
                  {copied === 'link' ? '복사됨!' : '복사'}
                </button>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={handleRegenerate}
                    disabled={shareBusy}
                    title="링크 재발급"
                    className={`${smallBtn} bg-yellow-50 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-100`}
                  >
                    <RefreshCw size={14} />
                  </button>
                )}
              </div>
              {ledger.shareEnabled && isDirty && (
                <p className="text-xs text-amber-600 dark:text-amber-400">저장하지 않은 변경은 공개 페이지에 아직 반영되지 않았습니다.</p>
              )}
            </div>
          </SectionCard>
        </div>
      </div>

      {/* 모바일 하단 바: 요약 + 저장 */}
      <div className="md:hidden fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] bg-white/95 dark:bg-slate-800/95 backdrop-blur border-t border-gray-200 dark:border-slate-700 shadow-[0_-2px_8px_rgba(0,0,0,0.08)]">
        <button
          type="button"
          onClick={() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className="flex-1 min-w-0 text-left"
        >
          <div className="text-[11px] text-gray-500 dark:text-slate-400">
            {issues.length > 0 ? `입력 오류 ${issues.length}건` : `송금 ${result.transfers.length}건 보기`}
          </div>
          <div className="text-sm font-bold text-gray-800 dark:text-slate-100 truncate tabular-nums">
            {result.summary.totalFee > 0 || result.summary.feeCovered > 0
              ? surplusText(result.summary)
              : `총지출 ${won(result.summary.totalExpense)}`}
          </div>
        </button>
        {!readOnly && (
          <button
            type="button"
            onClick={() => handleSave()}
            disabled={!canSave || !isDirty}
            className="shrink-0 inline-flex items-center gap-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold py-2 px-4 rounded-lg transition-colors text-sm"
          >
            {savedFlash && !isDirty && <Check size={16} />}
            {isDirty && !saving ? '● 저장' : saveLabel}
          </button>
        )}
      </div>

      {showTreasurerPicker && (
        <MemberPickerModal
          treasurers
          title="총무 지정"
          initialSelected={treasurerIds}
          addedUserIds={new Set()}
          onClose={() => setShowTreasurerPicker(false)}
          onAdd={applyTreasurers}
        />
      )}
      {showMemberPicker && (
        <MemberPickerModal
          addedUserIds={new Set(data.participants.map((p) => p.userId).filter((x): x is string => !!x))}
          onClose={() => setShowMemberPicker(false)}
          onAdd={addMembers}
        />
      )}
    </div>
  );
}
