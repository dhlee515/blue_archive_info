// 텍스트/데이터 포맷 유틸리티

import type { AttackType, ArmorType, StudentRoleType, StudentPosition } from '@/types/student';

const ATTACK_TYPE_LABELS: Record<AttackType, string> = {
  Explosive: '폭발',
  Piercing: '관통',
  Mystic: '신비',
  Sonic: '진동',
};

const ARMOR_TYPE_LABELS: Record<ArmorType, string> = {
  LightArmor: '경장갑',
  HeavyArmor: '중장갑',
  Unarmed: '특수장갑',
  ElasticArmor: '탄력장갑',
};

const ROLE_TYPE_LABELS: Record<StudentRoleType, string> = {
  Tank: '탱커',
  Healer: '힐러',
  Dealer: '딜러',
  Supporter: '서포터',
  Vehicle: '비클',
};

const POSITION_LABELS: Record<StudentPosition, string> = {
  Front: '전방',
  Middle: '중간',
  Back: '후방',
};

const SCHOOL_LABELS: Record<string, string> = {
  Gehenna: '게헨나',
  Millennium: '밀레니엄',
  Trinity: '트리니티',
  Abydos: '아비도스',
  Hyakkiyako: '백귀야행',
  RedWinter: '붉은겨울',
  Shanhaijing: '산해경',
  Valkyrie: '발키리',
  SRT: 'SRT',
  Arius: '아리우스',
  ETC: '기타',
  Tokiwadai: '토키와다이',
  Sakugawa: '사쿠가와',
};

const TERRAIN_LABELS = ['D', 'C', 'B', 'A', 'S', 'SS'];

/** 공격 속성을 한국어로 변환 */
export function formatAttackType(type: string): string {
  return ATTACK_TYPE_LABELS[type as AttackType] ?? type;
}

/** 방어 속성을 한국어로 변환 */
export function formatArmorType(type: string): string {
  return ARMOR_TYPE_LABELS[type as ArmorType] ?? type;
}

/** 역할군을 한국어로 변환 */
export function formatRoleType(type: string): string {
  return ROLE_TYPE_LABELS[type as StudentRoleType] ?? type;
}

/** 포지션을 한국어로 변환 */
export function formatPosition(type: string): string {
  return POSITION_LABELS[type as StudentPosition] ?? type;
}

/** 학교명을 한국어로 변환 */
export function formatSchool(school: string): string {
  return SCHOOL_LABELS[school] ?? school;
}

/** 별(★) 문자열로 래리티 표현 */
export function formatRarity(rarity: number): string {
  return '★'.repeat(rarity);
}

/** 숫자를 K/M 단위로 약식 표기 (예: 12500 → "12.5K") */
export function formatStat(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toString();
}

/** 지형 적응도 숫자를 등급으로 변환 (0=D, 1=C, 2=B, 3=A, 4=S, 5=SS) */
export function formatTerrain(value: number): string {
  return TERRAIN_LABELS[value] ?? '?';
}
