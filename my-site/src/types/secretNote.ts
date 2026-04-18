// 도메인 타입 정의 - 비밀 노트 (admin 전용, URL 공유용)

/** 비밀 노트 */
export interface SecretNote {
  id: string;
  slug: string;
  title: string;
  content: string;           // decoded HTML
  authorId?: string;         // anon 조회(RPC) 시 undefined
  createdAt: string;
  updatedAt: string;
}

/** 비밀 노트 작성/수정 폼 데이터 */
export interface SecretNoteFormData {
  title: string;
  content: string;
  customSlug?: string;       // 선택적 수동 슬러그. 비우면 DB 트리거가 자동 생성
}
