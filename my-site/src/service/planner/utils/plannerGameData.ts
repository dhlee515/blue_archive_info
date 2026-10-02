// 플래너 페이지 공통 — SchaleDB 게임 데이터 로드 (localStorage TTL 캐시 경유).

import { fetchSchaleDB } from '@/lib/schaledbCache';
import type {
  SchaleDBConfig,
  SchaleDBEquipmentMap,
  SchaleDBItemMap,
  SchaleDBStudentMap,
} from '@/types/schaledb';

export interface PlannerGameData {
  students: SchaleDBStudentMap;
  items: SchaleDBItemMap;
  equipment: SchaleDBEquipmentMap;
}

/** 로드 완료 전 초기 state */
export const EMPTY_GAME_DATA: PlannerGameData = { students: {}, items: {}, equipment: {} };

export async function loadPlannerGameData(): Promise<PlannerGameData> {
  const [students, items, equipment] = await Promise.all([
    fetchSchaleDB<SchaleDBStudentMap>('students'),
    fetchSchaleDB<SchaleDBItemMap>('items'),
    fetchSchaleDB<SchaleDBEquipmentMap>('equipment'),
  ]);
  return { students, items, equipment };
}

/** 모든 학생 공통 선호 태그 (인연 선물 매칭용) */
export async function loadCommonFavorTags(): Promise<readonly string[]> {
  const config = await fetchSchaleDB<SchaleDBConfig>('config');
  return config.CommonFavorItemTags ?? [];
}
