// SchaleDB 설정 — URL 상수, 엔드포인트 맵, 캐시 설정

const BASE_URL = 'https://schaledb.com';
const DATA_LANG = 'kr';

/** SchaleDB 데이터 엔드포인트 */
export const SCHALEDB_ENDPOINTS = {
  students: `${BASE_URL}/data/${DATA_LANG}/students.min.json`,
  items: `${BASE_URL}/data/${DATA_LANG}/items.min.json`,
  equipment: `${BASE_URL}/data/${DATA_LANG}/equipment.min.json`,
  raids: `${BASE_URL}/data/${DATA_LANG}/raids.min.json`,
  currency: `${BASE_URL}/data/${DATA_LANG}/currency.min.json`,
  furniture: `${BASE_URL}/data/${DATA_LANG}/furniture.min.json`,
  localization: `${BASE_URL}/data/${DATA_LANG}/localization.min.json`,
} as const;

/** SchaleDB 이미지 베이스 URL */
export const SCHALEDB_IMAGE_BASE = `${BASE_URL}/images`;

/** localStorage 캐시 설정 */
export const SCHALEDB_CACHE = {
  /** 캐시 키 접두사 */
  PREFIX: 'schaledb_',
  /** TTL: 24시간 (밀리초) */
  TTL: 24 * 60 * 60 * 1000,
} as const;

export type SchaleDBEndpointKey = keyof typeof SCHALEDB_ENDPOINTS;
