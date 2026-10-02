// SchaleDB 이미지 URL 헬퍼

import { SCHALEDB_IMAGE_BASE } from './schaledb';

/** 학생 초상화 이미지 */
export function studentPortraitUrl(id: number): string {
  return `${SCHALEDB_IMAGE_BASE}/student/portrait/${id}.webp`;
}

/** 학생 아이콘 이미지 */
export function studentIconUrl(id: number): string {
  return `${SCHALEDB_IMAGE_BASE}/student/icon/${id}.webp`;
}

/** 무기 이미지 */
export function weaponImageUrl(weaponImg: string): string {
  return `${SCHALEDB_IMAGE_BASE}/weapon/${weaponImg}.webp`;
}

/** 장비 이미지 — equipment 는 `/icon/` 서브경로 필요 */
export function equipmentImageUrl(icon: string): string {
  return `${SCHALEDB_IMAGE_BASE}/equipment/icon/${icon}.webp`;
}

/** 스킬 아이콘 이미지 — skill 은 `/icon/` 서브경로 없음 */
export function skillIconUrl(icon: string): string {
  return `${SCHALEDB_IMAGE_BASE}/skill/${icon}.webp`;
}

/** 아이템 아이콘 이미지 — item 은 `/icon/` 서브경로 필요 */
export function itemIconUrl(icon: string): string {
  return `${SCHALEDB_IMAGE_BASE}/item/icon/${icon}.webp`;
}

/**
 * 선물 반응 표정 아이콘 — 선호 배수 (1~4) 와 1:1 (SchaleDB 학생 / 아이템 페이지와 동일 리소스).
 * 1 = 기본 웃음 … 4 = 하트 눈.
 */
export function giftReactionIconUrl(grade: 1 | 2 | 3 | 4): string {
  return `${SCHALEDB_IMAGE_BASE}/ui/Cafe_Interaction_Gift_0${grade}.png`;
}
