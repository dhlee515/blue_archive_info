// 재화 인벤토리 페이지의 그룹 구조 빌더.
//
// 그룹:
//  - synthetic        : 크레딧 (단일)
//  - student-reports  : 활동 보고서 4종 (학생 EXP 환산용 — exp_conversion.json)
//  - weapon-parts     : 무기 부품 단일 그룹 (4시리즈 × 4등급 = 16종, 시리즈→등급 순 정렬)
//  - equipment-stones : 장비 강화석 4등급 (일반 장비 레벨업용 — 현재 보유량 입력만, 환산 미적용)
//  - pieces-<cat>     : 장비 설계도면, 카테고리(Hat/Hairpin/…)별
//  - gear-favor       : 고유장비 티어업용 애착 선물 (Favor)
//  - artifacts        : 오파츠 조각 (Material/Artifact) — 고유장비 + 스킬업 공용
//
// 장비 설계도면 판별: `!eq.Recipe && eq.MaxLevel === 1`
//
// 고유장비 재료 수집: 모든 학생의 Gear.TierUpMaterial id 를 itemsData 로 lookup,
//   Category 로 애착 선물 / 오파츠 분리. Artifact 는 스킬업과 공용이므로 별도 섹션.

import type { SchaleDBEquipment, SchaleDBItem, SchaleDBStudent } from '@/types/schaledb';
import { STUDENT_REPORTS, WEAPON_PART_SERIES, EQUIPMENT_STONES } from './expConversion';

const CATEGORY_LABEL: Record<string, string> = {
  Hat: '모자',
  Hairpin: '머리핀',
  Shoes: '신발',
  Bag: '가방',
  Charm: '부적',
  Watch: '시계',
  Gloves: '장갑',
  Badge: '배지',
  Necklace: '목걸이',
};

const CATEGORY_ORDER = Object.keys(CATEGORY_LABEL);

export interface CatalogGroup {
  id: string;
  name: string;
  keys: string[];
  /** 페이지 초기 진입 시 기본 펼침 여부 */
  defaultOpen?: boolean;
  /** 선택적 도움말 텍스트 */
  hint?: string;
}

export function buildInventoryCatalog(
  equipmentData: Record<string, SchaleDBEquipment>,
  studentsData: Record<string, SchaleDBStudent>,
  itemsData: Record<string, SchaleDBItem>,
): CatalogGroup[] {
  const groups: CatalogGroup[] = [];

  // 1) 기본 재화 — 크레딧 (단일)
  groups.push({
    id: 'synthetic',
    name: '기본 재화',
    keys: ['credit'],
    defaultOpen: true,
  });

  // 2) 학생 활동 보고서
  groups.push({
    id: 'student-reports',
    name: '활동 보고서 (학생 EXP)',
    keys: STUDENT_REPORTS.map((it) => it.key),
    defaultOpen: true,
    hint: '학생 레벨업에 사용. 등급별로 입력하면 합계 EXP 로 환산해 부족분을 계산합니다.',
  });

  // 3) 무기 부품 — 단일 그룹 (4시리즈 × 4등급 = 16개). 시리즈→등급 순.
  const allWeaponPartKeys: string[] = [];
  const bonusHints: string[] = [];
  for (const series of Object.values(WEAPON_PART_SERIES)) {
    for (const item of series.items) allWeaponPartKeys.push(item.key);
    const bonusLabel = series.bonusWeaponTypes.includes('*')
      ? '모든 무기'
      : series.bonusWeaponTypes.join('/');
    bonusHints.push(`${series.label}(${bonusLabel})`);
  }
  groups.push({
    id: 'weapon-parts',
    name: '무기 부품',
    keys: allWeaponPartKeys,
    hint: `${bonusHints.join(' · ')} — 무기 타입 매칭 시 1.5× 보너스 (학생 카드에 표시)`,
  });

  // 4) 장비 강화석 (equipment.min.json 의 Exp 카테고리) — 일반 장비 레벨업용
  groups.push({
    id: 'equipment-stones',
    name: '장비 강화석',
    keys: EQUIPMENT_STONES.map((it) => it.key),
    hint: '일반 장비 레벨업에 사용. 현재 플래너는 보유량 입력만 받으며 부족 계산에는 미반영 (장비 레벨업은 향후 확장).',
  });

  // 5) 장비 설계도면 — 카테고리별 그룹
  const piecesByCategory: Record<string, SchaleDBEquipment[]> = {};
  for (const eq of Object.values(equipmentData)) {
    const isPiece = !eq.Recipe && eq.MaxLevel === 1;
    if (!isPiece) continue;
    if (!piecesByCategory[eq.Category]) piecesByCategory[eq.Category] = [];
    piecesByCategory[eq.Category].push(eq);
  }

  const allCategories = [
    ...CATEGORY_ORDER.filter((c) => piecesByCategory[c]),
    ...Object.keys(piecesByCategory).filter((c) => !CATEGORY_ORDER.includes(c)),
  ];

  for (const cat of allCategories) {
    const pieces = [...piecesByCategory[cat]].sort((a, b) => a.Tier - b.Tier);
    groups.push({
      id: `pieces-${cat}`,
      name: `설계도면 — ${CATEGORY_LABEL[cat] ?? cat}`,
      keys: pieces.map((p) => String(p.Id)),
    });
  }

  // 3) 고유장비 재료 — Favor (애착 선물) / Artifact (오파츠) 로 분리
  const gearMaterialIds = new Set<string>();
  for (const s of Object.values(studentsData)) {
    const mats = s.Gear?.TierUpMaterial;
    if (!mats) continue;
    for (const row of mats) {
      for (const id of row) {
        gearMaterialIds.add(String(id));
      }
    }
  }

  const favorKeys: string[] = [];
  const artifactKeys: string[] = [];
  const unclassifiedKeys: string[] = [];

  for (const id of gearMaterialIds) {
    const item = itemsData[id];
    if (!item) {
      unclassifiedKeys.push(id);
      continue;
    }
    if (item.Category === 'Favor') {
      favorKeys.push(id);
    } else if (item.Category === 'Material' && item.SubCategory === 'Artifact') {
      artifactKeys.push(id);
    } else {
      unclassifiedKeys.push(id);
    }
  }

  const byIdAsc = (a: string, b: string) => Number(a) - Number(b);

  if (favorKeys.length > 0) {
    groups.push({
      id: 'gear-favor',
      name: '고유장비 — 애착 선물',
      keys: favorKeys.sort(byIdAsc),
      hint: '고유장비 티어업 시 촉매로 소모되는 선물 아이템.',
    });
  }
  if (artifactKeys.length > 0) {
    groups.push({
      id: 'artifacts',
      name: '오파츠 (스킬·고유장비 공용)',
      keys: artifactKeys.sort(byIdAsc),
      hint: '고유장비 티어업과 스킬 강화에 공용으로 사용되는 아티팩트 조각.',
    });
  }
  if (unclassifiedKeys.length > 0) {
    groups.push({
      id: 'gear-other',
      name: '고유장비 — 기타 재료',
      keys: unclassifiedKeys.sort(byIdAsc),
    });
  }

  return groups;
}
