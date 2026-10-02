// 역할 기반 권한 판정 — 가드 / 사이드바 / 페이지 공통.

import type { UserRole } from '@/types/auth';

/** 관리자 전용 기능 (유저 관리, 카테고리, 비밀 노트 등) */
export function isAdminRole(role: UserRole | null | undefined): boolean {
  return role === 'admin';
}

/** 가이드 작성/수정 + 내부 공지 열람 (editor 이상) */
export function canEditRole(role: UserRole | null | undefined): boolean {
  return role === 'admin' || role === 'editor';
}
