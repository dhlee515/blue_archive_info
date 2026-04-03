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

/** 장비 이미지 */
export function equipmentImageUrl(icon: string): string {
  return `${SCHALEDB_IMAGE_BASE}/equipment/${icon}.webp`;
}

/** 스킬 아이콘 이미지 */
export function skillIconUrl(icon: string): string {
  return `${SCHALEDB_IMAGE_BASE}/skill/${icon}.webp`;
}

/** 아이템 아이콘 이미지 */
export function itemIconUrl(icon: string): string {
  return `${SCHALEDB_IMAGE_BASE}/item/${icon}.webp`;
}
