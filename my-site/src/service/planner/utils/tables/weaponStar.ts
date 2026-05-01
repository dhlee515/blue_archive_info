// 고유무기 성급업 엘레프 테이블
//
// 데이터 원본: src/data/weapon_star.json
//
// 학생 성급(1~4성)과 고유무기 성급(전무 1~4성)을 통합한 8단계.
//   - level 1~4 : 학생 성급 (엘레프로 승급)
//   - level 5   : 5성 달성 = 전무 1성 해금
//   - level 6~8 : 전무 2~4성
//
// 엘레프는 학생별 고유 아이템 (items.min.json 의 10000+ id 범위).
// 누적 값은 "레벨 1(1성) 기준 0" 에서 출발한 누적.

import weaponStarData from '@/data/weapon_star.json';

export interface WeaponStar {
  level: number;         // 1 ~ 8
  label: string;
  cumulativeEleph: number;
}

export const WEAPON_STARS: readonly WeaponStar[] = weaponStarData.stars;

/**
 * 인덱스로 직접 조회 가능한 누적 엘레프 배열.
 * CUMULATIVE_ELEPH[star] = 1성에서 `star`성 까지 누적 소비 엘레프.
 * 인덱스 0 은 placeholder (0).
 */
export const CUMULATIVE_ELEPH: readonly number[] = [
  0,
  ...WEAPON_STARS.map((s) => s.cumulativeEleph),
];

/** 엘레프로 도달 가능한 최대 성급 (8성 = 전무 4성) */
export const WEAPON_STAR_MAX = WEAPON_STARS.length;
