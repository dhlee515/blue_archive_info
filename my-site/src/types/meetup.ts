// 오프라인 모임 회계 장부 — PLAN_meetup_ledger.md §2

/** 참가비 구간 (예: '1차' 30,000 / '1+2차' 45,000) */
export interface MeetupFeeTier {
  id: string;
  label: string;
  /** 원, 정수 ≥ 0 */
  amount: number;
}

export interface MeetupParticipant {
  id: string;
  /** 사이트 회원 id (profiles.id). null = 회원 연결 전 직접 입력한 참가자 (이전 데이터) */
  userId: string | null;
  /** 닉네임 — 회원이면 추가 시점의 닉네임을 복사 (결산 기록이므로 이후 변경을 따라가지 않음). 장부 안에서 중복 불가 */
  name: string;
  /** null = 참가비 없음 (더치페이 전용 모임) */
  feeTierId: string | null;
  /** 참가비를 정산 전에 미리 냈는지. 정산 송금에 참가비를 같이 보낸 경우는 체크하지 않는다 (이중 계산 방지) */
  feePaid: boolean;
  /** 정산 완료 체크 시점의 순잔액 (null = 미완료). 현재 순잔액과 다르면 그 차이가 추가로 주고받을 차액 */
  settledAmount: number | null;
  /** 참석 시작일 YYYY-MM-DD (null = 모임 시작일부터). 여러 날 모임에서만 의미 있음 */
  attendFrom: string | null;
  /** 참석 끝일 YYYY-MM-DD (null = 모임 끝일까지) */
  attendTo: string | null;
  /** 내부 메모 — 공개 스냅샷 제외 */
  memo: string;
}

export type MeetupExpenseCategory = 'venue' | 'food' | 'goods' | 'transport' | 'etc';

/**
 * 지출 충당 방식
 * - fee: 회비에서 충당
 * - present: 지출 날짜에 참석한 사람 전원 균등 분담 (계산할 때마다 참석 기간으로 다시 구함)
 * - split: 직접 고른 참가자 균등 분담
 */
export type MeetupExpenseCover =
  | { kind: 'fee' }
  | { kind: 'present' }
  | { kind: 'split'; among: string[] };

/** 결제자: 모임 통장(총무) 또는 participant id */
export const TREASURY = 'treasury';

export interface MeetupExpense {
  id: string;
  label: string;
  category: MeetupExpenseCategory;
  /** 원, 정수 > 0 */
  amount: number;
  /** 사용 날짜 YYYY-MM-DD (null = 모임 시작일). 여러 날 모임에서 `present` 분담 대상을 정함 */
  date: string | null;
  /** TREASURY 또는 participant id */
  paidBy: string;
  cover: MeetupExpenseCover;
  /** 내부 메모 — 공개 스냅샷 제외 */
  memo: string;
}

export type MeetupSurplusMode = 'carry' | 'refund';
export type MeetupDeficitMode = 'collect' | 'absorb';
export type MeetupTransferMode = 'hub' | 'min';

/** jsonb `data` 컬럼에 저장되는 장부 본문 */
export interface MeetupLedgerData {
  version: 1;
  /** 총무 participant id */
  treasurerId: string | null;
  feeTiers: MeetupFeeTier[];
  participants: MeetupParticipant[];
  expenses: MeetupExpense[];
  /** 회비 잔액이 남을 때: 이월 / 참가비 비례 환급 */
  surplusMode: MeetupSurplusMode;
  /** 회비가 모자랄 때: 참가비 비례 추가 징수 / 총무 부담 */
  deficitMode: MeetupDeficitMode;
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

/** 공개 결산 페이지가 그대로 렌더하는 스냅샷 (내부 메모 제외) */
export interface MeetupPublicSnapshot {
  version: 1;
  generatedAt: string;
  treasurerName: string | null;
  transferMode: MeetupTransferMode;
  summary: MeetupSummary;
  /** 날짜순 정렬 */
  expenses: {
    /** 여러 날 모임일 때만 */
    date: string | null;
    label: string;
    category: MeetupExpenseCategory;
    amount: number;
    payerName: string;
    coverLabel: string;
  }[];
  participants: {
    name: string;
    tierLabel: string | null;
    /** 일부 기간만 참석한 경우 표시용 (예: '10-12 ~ 10-12') */
    attendLabel: string | null;
    owed: number;
    paid: number;
    balance: number;
    feePaid: boolean;
    /** 총무 본인 — 순잔액은 통장과 합쳐 정리되므로 따로 표시하지 않음 */
    isTreasurer: boolean;
    settled: boolean;
    /** 정산 완료 후 생긴 차액 (미완료면 0) */
    diff: number;
  }[];
  /** 닉네임 기준 송금 목록 */
  transfers: { from: string; to: string; amount: number }[];
}

export interface MeetupSummary {
  /** 참가비 합계 (납부 여부 무관) */
  totalFee: number;
  /** 납부된 참가비 합계 */
  paidFee: number;
  totalExpense: number;
  /** 회비에서 충당하는 지출 합계 */
  feeCovered: number;
  /** 참가자 분담 지출 합계 */
  splitTotal: number;
  /** 회비 잔액 (참가비 합계 − 회비 충당 지출). 음수 = 부족 */
  r0: number;
  surplusMode: MeetupSurplusMode;
  deficitMode: MeetupDeficitMode;
  /** 정산 후 통장에 남는 돈 */
  finalBalance: number;
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
