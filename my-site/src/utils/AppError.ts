// 커스텀 애플리케이션 에러

/** 애플리케이션 에러 코드 */
export type AppErrorCode = 'NOT_IMPLEMENTED' | 'API_ERROR' | 'NOT_FOUND' | 'UNKNOWN';

/** 커스텀 애플리케이션 에러 클래스 */
export class AppError extends Error {
  readonly code: AppErrorCode;

  constructor(message: string, code: AppErrorCode = 'UNKNOWN') {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}
