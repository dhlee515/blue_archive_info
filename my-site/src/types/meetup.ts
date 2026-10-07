// 오프라인 모임 회계 장부 — PLAN_meetup_ledger.md §2, §10
//
// 모델: 참가자는 선입금(미리 낸 돈)을 낼 수 있고, 지출 하나 = 이벤트 (예: 고기 1차 30,000).
// 이벤트마다 참석한 사람끼리 실제 금액을 균등 분담하고, 끝나면 "선입금 + 직접 결제 − 분담" 차액만 정산한다.

export interface MeetupParticipant {
  id: string;
  /** 사이트 회원 id (profiles.id). null = 회원 연결 전 직접 입력한 참가자 (이전 데이터) */
  userId: string | null;
  /** 닉네임 — 회원이면 추가 시점의 닉네임을 복사 (결산 기록이므로 이후 변경을 따라가지 않음). 장부 안에서 중복 불가 */
  name: string;
  /** 정산 전에 모임 통장(총무)에 미리 낸 돈 (원, 정수 ≥ 0). 정산 때 자기 부담에서 그대로 빠진다 */
  prepaid: number;
  /** 정산 완료 체크 시점의 순잔액 (null = 미완료). 현재 순잔액과 다르면 그 차이가 추가로 주고받을 차액 */
  settledAmount: number | null;
  /** 내부 메모 — 공개 스냅샷 제외 */
  memo: string;
}

export type MeetupExpenseCategory = 'venue' | 'food' | 'goods' | 'transport' | 'etc';

/** 결제자: 모임 통장(총무 — 선입금을 보관) 또는 participant id */
export const TREASURY = 'treasury';

/** 지출 = 이벤트. 참석한 사람끼리 균등 분담 */
export interface MeetupExpense {
  id: string;
  label: string;
  category: MeetupExpenseCategory;
  /** 원, 정수 > 0 */
  amount: number;
  /** TREASURY 또는 participant id */
  paidBy: string;
  /**
   * 불참한 participant id. 빠진 사람만 저장하므로 기본은 전원 참석이고,
   * 나중에 추가한 참가자도 참석으로 잡힌다
   */
  absent: string[];
  /** 내부 메모 — 공개 스냅샷 제외 */
  memo: string;
}

export type MeetupTransferMode = 'hub' | 'min';

/** jsonb `data` 컬럼에 저장되는 장부 본문 (이전 형식은 normalizeLedgerData 가 읽을 때 변환) */
export interface MeetupLedgerData {
  version: 2;
  /** 정산 총무 participant id — 송금이 모이고 선입금 · 통장 결제를 맡는 사람 */
  treasurerId: string | null;
  participants: MeetupParticipant[];
  expenses: MeetupExpense[];
  /** 송금 방식: 총무 경유 / 송금 건수 줄이기 */
  transferMode: MeetupTransferMode;
}

export type MeetupLedgerStatus = 'open' | 'closed';

/** 모임 기간 (DB 컬럼 meetup_date / meetup_end_date). end 가 null 이면 하루짜리 */
export interface MeetupPeriod {
  start: string | null;
  end: string | null;
}

/** meetup_ledgers 행 */
export interface MeetupLedger {
  id: string;
  slug: string;
  title: string;
  /** 시작일 YYYY-MM-DD */
  meetupDate: string | null;
  /** 끝일 YYYY-MM-DD (null = 하루짜리 모임) */
  meetupEndDate: string | null;
  status: MeetupLedgerStatus;
  shareEnabled: boolean;
  data: MeetupLedgerData;
  /** 이 모임을 편집할 수 있는 총무들의 회원 id (최고 관리자만 임명 · 해제). 정산 총무(data.treasurerId)는 이 중 한 명 */
  treasurerUserIds: string[];
  createdBy: string;
  createdAt: string;
  /** 낙관적 잠금 토큰 — PostgREST 가 돌려준 문자열을 그대로 보관 */
  updatedAt: string;
  deletedAt: string | null;
}

/** 송금 한 건. from / to 는 participant id 또는 TREASURY */
export interface SettlementTransfer {
  from: string;
  to: string;
  amount: number;
}

export interface MeetupSummary {
  totalExpense: number;
  /** 선입금 합계 */
  totalPrepaid: number;
  /** 모임 통장(선입금)에서 결제한 지출 합계 */
  treasuryPaid: number;
  /** 정산 전 통장 잔액 = 선입금 합계 − 통장 결제 (음수 = 총무가 모자란 돈을 먼저 냄). 정산이 끝나면 0 */
  treasuryCash: number;
}

/** 참가비 구간 방식 시절 공개 스냅샷의 요약 — 다시 저장하기 전까지 공개 페이지에 남아 있을 수 있음 */
export interface LegacyMeetupSummary {
  totalFee: number;
  paidFee: number;
  totalExpense: number;
  feeCovered: number;
  splitTotal: number;
  r0: number;
  surplusMode: 'carry' | 'refund';
  deficitMode: 'collect' | 'absorb';
  finalBalance: number;
}

/** 공개 결산 페이지가 그대로 렌더하는 스냅샷 (내부 메모 · 회원 id 제외). version 1 = 이전 형식 */
export interface MeetupPublicSnapshot {
  version: 1 | 2;
  generatedAt: string;
  treasurerName: string | null;
  transferMode: MeetupTransferMode;
  summary: MeetupSummary | LegacyMeetupSummary;
  expenses: {
    /** 이전 형식 스냅샷 (참석 기간 방식) 에만 있음 */
    date?: string | null;
    label: string;
    category: MeetupExpenseCategory;
    amount: number;
    payerName: string;
    coverLabel: string;
  }[];
  participants: {
    name: string;
    /** 선입금 (이전 형식 스냅샷에는 없음) */
    prepaid?: number;
    /** 빠진 이벤트 이름 (전부 참석이면 빈 배열). 이전 형식 스냅샷에는 없음 */
    absentEvents?: string[];
    /** 이전 형식 스냅샷 (참가비 구간 · 참석 기간 방식) 에만 있음 */
    tierLabel?: string | null;
    feePaid?: boolean;
    attendLabel?: string | null;
    owed: number;
    paid: number;
    balance: number;
    /** 총무 본인 — 순잔액은 통장과 합쳐 정리되므로 따로 표시하지 않음 */
    isTreasurer: boolean;
    settled: boolean;
    /** 정산 완료 후 생긴 차액 (미완료면 0) */
    diff: number;
  }[];
  /** 닉네임 기준 송금 목록 */
  transfers: { from: string; to: string; amount: number }[];
}

/** 공개 RPC 결과 */
export interface MeetupPublicSettlement {
  title: string;
  meetupDate: string | null;
  meetupEndDate: string | null;
  status: MeetupLedgerStatus;
  snapshot: MeetupPublicSnapshot | null;
  updatedAt: string;
}
