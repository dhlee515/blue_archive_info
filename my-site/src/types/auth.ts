// 도메인 타입 정의 - 인증

/** 사용자 역할 */
export type UserRole = 'admin' | 'editor' | 'user' | 'pending';

/** 인증된 사용자 정보 */
export interface AuthUser {
  id: string;
  email: string;
  nickname: string;
  role: UserRole;
}

/** 관리자용 유저 목록 항목 */
export interface UserProfile {
  id: string;
  email: string;
  nickname: string;
  role: UserRole;
  createdAt: string;
}
