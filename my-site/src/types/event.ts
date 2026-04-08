// 이벤트 계산기 도메인 타입 정의

/** 이벤트 아키타입 식별자 — 새 아키타입 추가 시 이 union에 리터럴 추가 */
export type EventArchetypeId = 'point-accumulation' | 'material-exchange' | 'card-matching';

/** 카드 등급 */
export type CardRarity = 'SSR' | 'SR' | 'R' | 'N';

/** 짝맞추기 카드 한 장의 정의 */
export interface CardType {
  id: string;
  name: string;
  rarity: CardRarity;
  imageUrl?: string;
}

/** 모든 이벤트가 공유하는 공통 메타데이터 */
interface EventMetaBase {
  id: string;              // URL slug
  name: string;            // 한국어 표시명
  startDate: string;       // ISO 날짜 문자열
  endDate: string;         // ISO 날짜 문자열
  bannerUrl?: string;
  archetype: EventArchetypeId;
  description?: string;
}

/** 포인트 누적형 이벤트 (가챠/축제 등) */
export interface PointEventConfig extends EventMetaBase {
  archetype: 'point-accumulation';
  /** 목표 포인트 (예: 보상 만렙 기준) */
  targetPoints: number;
  /** 보상 단계 (선택) */
  rewardTiers?: { points: number; label: string }[];
}

/** 재화 교환형 이벤트 */
export interface ExchangeEventConfig extends EventMetaBase {
  archetype: 'material-exchange';
  /** 교환 재화명 (예: 토큰, 코인) */
  currencyName: string;
  /** 1회 진행 시 획득 재화량 */
  currencyPerRun: number;
  /** 교환 가능한 보상 목록 */
  rewards: { name: string; cost: number; maxCount: number }[];
}

/** 짝맞추기 (메모리 게임) 이벤트 */
export interface CardMatchingConfig extends EventMetaBase {
  archetype: 'card-matching';
  /** 그리드 셀 개수 (예: 12) */
  gridSize: number;
  /** 출현 가능한 카드 종류 */
  cardTypes: CardType[];
}

/** 이벤트 디스크리미네이티드 유니언 — archetype 필드로 좁혀짐 */
export type EventConfig = PointEventConfig | ExchangeEventConfig | CardMatchingConfig;
