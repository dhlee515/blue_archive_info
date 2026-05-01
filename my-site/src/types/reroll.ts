/** 리세계 추천 카테고리 */
export interface RerollCategory {
  key: string;
  label: string;
  students: RerollStudent[];
}

/** 리세계 추천 학생 */
export interface RerollStudent {
  schaleId: number;
  highlighted: boolean;
}

/** 리세계 추천 서버 구분 */
export type RerollRegion = 'kr' | 'jp';

export const REROLL_REGIONS: { key: RerollRegion; label: string }[] = [
  { key: 'kr', label: '한섭' },
  { key: 'jp', label: '일섭' },
];

/** 잘못된 값 → 기본값 'kr' 으로 정규화 */
export function normalizeRerollRegion(value: string | null | undefined): RerollRegion {
  return value === 'jp' ? 'jp' : 'kr';
}
