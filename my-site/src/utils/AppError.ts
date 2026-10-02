// 커스텀 애플리케이션 에러 — repository 계층은 모든 실패를 AppError 로 던집니다.

/** 애플리케이션 에러 코드 */
export type AppErrorCode =
  | 'API_ERROR'      // Supabase / 외부 API 호출 실패
  | 'NOT_FOUND'      // 대상 리소스 없음
  | 'VALIDATION'     // 입력값 검증 실패 (메시지를 그대로 사용자에게 보여도 됨)
  | 'UNAUTHORIZED'   // 로그인 필요
  | 'UNKNOWN';

/** 커스텀 애플리케이션 에러 클래스 */
export class AppError extends Error {
  readonly code: AppErrorCode;
  /** 원본 에러 (Supabase PostgrestError / AuthError / REST 응답 등) — 디버깅용 */
  readonly cause?: unknown;

  constructor(message: string, code: AppErrorCode = 'UNKNOWN', cause?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.cause = cause;
  }
}
