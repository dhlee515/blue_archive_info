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
