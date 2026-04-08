// 이벤트 아키타입 레지스트리
//
// 새 아키타입을 추가하는 방법:
// 1. archetypes/{newArchetype}/ 폴더에 Form 컴포넌트 + 순수 계산 함수 작성
// 2. src/types/event.ts의 EventConfig union에 새 config 타입 추가
// 3. 이 레지스트리에 등록
// 4. 끝. JSON에서 archetype 필드로 새 타입 사용 가능

import type { ComponentType } from 'react';
import type { EventArchetypeId, EventConfig } from '@/types/event';
import PointAccumulationForm from './pointAccumulation/PointAccumulationForm';
import MaterialExchangeForm from './materialExchange/MaterialExchangeForm';
import CardMatchingForm from './cardMatching/CardMatchingForm';

interface ArchetypeEntry {
  /** UI에 표시될 한국어 라벨 */
  label: string;
  /** 이벤트 설정을 받아 계산기 폼을 렌더링하는 컴포넌트 */
  Form: ComponentType<{ config: EventConfig }>;
}

export const ARCHETYPE_REGISTRY: Record<EventArchetypeId, ArchetypeEntry> = {
  'point-accumulation': { label: '포인트 누적', Form: PointAccumulationForm },
  'material-exchange': { label: '재화 교환', Form: MaterialExchangeForm },
  'card-matching': { label: '짝 맞추기', Form: CardMatchingForm },
};
