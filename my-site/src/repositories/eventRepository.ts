import type { EventConfig } from '@/types/event';

// Vite의 import.meta.glob으로 src/data/events 폴더의 모든 JSON 파일을 자동 로드
// 새 이벤트 JSON을 추가하면 코드 수정 없이 자동 인식됨
const eventModules = import.meta.glob<{ default: EventConfig }>('@/data/events/*.json', {
  eager: true,
});

const ALL_EVENTS: EventConfig[] = Object.values(eventModules).map((mod) => mod.default);

export class EventRepository {
  /** 모든 이벤트 목록 (종료일 내림차순) */
  static async getAllEvents(): Promise<EventConfig[]> {
    return [...ALL_EVENTS].sort((a, b) => b.endDate.localeCompare(a.endDate));
  }

  /** ID로 단일 이벤트 조회 */
  static async getEventById(id: string): Promise<EventConfig | null> {
    return ALL_EVENTS.find((e) => e.id === id) ?? null;
  }

  /** 진행 중인 이벤트만 조회 (오늘 날짜 기준) */
  static async getActiveEvents(): Promise<EventConfig[]> {
    const today = new Date().toISOString().slice(0, 10);
    return ALL_EVENTS.filter((e) => e.startDate <= today && today <= e.endDate);
  }

  /** 종료된 이벤트만 조회 */
  static async getEndedEvents(): Promise<EventConfig[]> {
    const today = new Date().toISOString().slice(0, 10);
    return ALL_EVENTS.filter((e) => e.endDate < today);
  }
}
