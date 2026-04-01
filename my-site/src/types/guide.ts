// 도메인 타입 정의 - 정보글

/** 카테고리 */
export interface Category {
  id: string;
  name: string;
  createdAt: string;
}

/** 정보글 */
export interface Guide {
  id: string;
  title: string;
  categoryId: string;
  content: string;
  imageUrl: string | null;
  authorId: string;
  authorNickname: string;
  authorRole: string;
  isInternal: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 정보글 로그 */
export interface GuideLog {
  id: string;
  guideId: string;
  editorId: string;
  editorNickname: string;
  action: 'create' | 'update' | 'delete';
  createdAt: string;
}

/** 정보글 작성/수정 폼 데이터 */
export interface GuideFormData {
  title: string;
  categoryId: string;
  content: string;
  imageFile: File | null;
  isInternal: boolean;
}
