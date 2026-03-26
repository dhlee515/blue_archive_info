// 공통 유틸리티 타입 정의

/** API 응답 래퍼 타입 */
export interface ApiResponse<T> {
  data: T;
  status: number;
  message: string;
}

/** 페이지 라우트 경로 */
export type RoutePath = '/' | '/detail';

/** 로딩/에러 상태를 포함한 비동기 상태 */
export interface AsyncState<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
}
