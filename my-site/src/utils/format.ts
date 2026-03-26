// 텍스트/데이터 포맷 유틸리티
import { AppError } from './AppError';

/**
 * 공격 속성(AttackType)을 한국어로 변환
 * @param type - AttackType 문자열
 */
export function formatAttackType(type: string): string {
  throw new AppError('Not implemented: formatAttackType', 'NOT_IMPLEMENTED');
}

/**
 * 방어 속성(ArmorType)을 한국어로 변환
 * @param type - ArmorType 문자열
 */
export function formatArmorType(type: string): string {
  throw new AppError('Not implemented: formatArmorType', 'NOT_IMPLEMENTED');
}

/**
 * 별(★) 문자열로 래리티 표현 생성
 * @param rarity - 1 | 2 | 3
 */
export function formatRarity(rarity: number): string {
  throw new AppError('Not implemented: formatRarity', 'NOT_IMPLEMENTED');
}

/**
 * 숫자를 K/M 단위로 약식 표기 (예: 12500 → "12.5K")
 * @param value - 숫자 값
 */
export function formatStat(value: number): string {
  throw new AppError('Not implemented: formatStat', 'NOT_IMPLEMENTED');
}
