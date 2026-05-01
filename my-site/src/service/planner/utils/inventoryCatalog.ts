// 재화 인벤토리 페이지의 그룹 구조 빌더.
//
// 그룹:
//  - synthetic        : 크레딧 (단일)
//  - student-reports  : 활동 보고서 4종 (학생 EXP 환산용 — exp_conversion.json)
//  - weapon-parts     : 무기 부품 단일 그룹 (4시리즈 × 4등급 = 16종, 시리즈→등급 순 정렬)
//  - equipment-stones : 장비 강화석 4등급 (일반 장비 레벨업용 — 현재 보유량 입력만, 환산 미적용)
//  - eleph            : 플래너에 추가한 학생들의 고유 엘레프 (성급업 재화)
//  - pieces-<cat>     : 장비 설계도면, 카테고리(Hat/Hairpin/…)별
//  - gear-favor       : 애장품 강화용 애착 선물 (Favor)
//  - artifacts        : 오파츠 조각 (Material/Artifact) — 애장품 + 스킬업 공용
//
// 장비 설계도면 판별: `!eq.Recipe && eq.MaxLevel === 1`
//
// 애장품 재료 수집: 모든 학생의 Gear.TierUpMaterial id 를 itemsData 로 lookup,
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

const byIdAsc = (a: string, b: string) => Number(a) - Number(b);

export function buildInventoryCatalog(
  equipmentData: Record<string, SchaleDBEquipment>,
  studentsData: Record<string, SchaleDBStudent>,
  itemsData: Record<string, SchaleDBItem>,
): CatalogGroup[] {
  const groups: CatalogGroup[] = [];

  // 1) 크레딧 (단일)
  groups.push({
    id: 'synthetic',
    name: '크레딧',
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

  // 5) 스킬 노트 (BookItem) + 비의서 — 일반 스킬 1~10
  // 5-b) WB (잠재력 강화) — id 2000/2001/2002 (체육/사격/위생)
  const WB_IDS = [2000, 2001, 2002];
  const wbKeys = WB_IDS.map((id) => String(id)).filter((k) => itemsData[k] !== undefined);
  if (wbKeys.length > 0) {
    groups.push({
      id: 'wb',
      name: '교양 WB (잠재력)',
      keys: wbKeys,
      hint: '잠재력 강화에 사용. 체육 = 체력, 사격 = 공격, 위생 = 치명.',
    });
  }

  // 5-c) 전술 교육 BD (CDItem) — EX 스킬 1~5
  // 학교별 12계열 × 4등급 = 48개. 학교명은 Name 에 "(학교명)" 으로 들어있어 검색으로 식별.
  const bookKeys: string[] = [];
  const cdKeys: string[] = [];
  for (const it of Object.values(itemsData)) {
    if (it.Category !== 'Material') continue;
    if (it.SubCategory === 'BookItem') bookKeys.push(String(it.Id));
    else if (it.SubCategory === 'CDItem') cdKeys.push(String(it.Id));
  }
  bookKeys.sort(byIdAsc);
  cdKeys.sort(byIdAsc);

  if (bookKeys.length > 0) {
    groups.push({
      id: 'skill-books',
      name: '기술 노트 (일반 스킬)',
      keys: bookKeys,
      hint: '기본/강화/서브 스킬 1~9 강화에 사용. 9→10 (M단계) 은 비의서 1개 + 크레딧 4M.',
    });
  }
  if (cdKeys.length > 0) {
    groups.push({
      id: 'skill-cds',
      name: '전술 교육 BD (EX 스킬)',
      keys: cdKeys,
      hint: 'EX 스킬 1~5 강화에 사용. 학교별 12계열 × 4등급.',
    });
  }

  // 6) 장비 설계도면 — 단일 그룹. 카테고리(모자/머리핀/...) 순 → 티어 오름차순.
  const pieces: SchaleDBEquipment[] = [];
  for (const eq of Object.values(equipmentData)) {
    const isPiece = !eq.Recipe && eq.MaxLevel === 1;
    if (isPiece) pieces.push(eq);
  }
  const categoryRank = (cat: string) => {
    const idx = CATEGORY_ORDER.indexOf(cat);
    return idx === -1 ? CATEGORY_ORDER.length : idx;
  };
  pieces.sort((a, b) => {
    const ra = categoryRank(a.Category);
    const rb = categoryRank(b.Category);
    if (ra !== rb) return ra - rb;
    return a.Tier - b.Tier;
  });
  if (pieces.length > 0) {
    groups.push({
      id: 'pieces',
      name: '장비 설계도면',
      keys: pieces.map((p) => String(p.Id)),
      hint: '일반 장비 제작 시 사용. 카테고리 → 티어 순.',
    });
  }

  // 7) 애장품 재료 (Favor) — Gear.TierUpMaterial 에서 사용되는 선물 아이템.
  //    오파츠(Artifact) 는 스킬과 공용이라 별도 섹션으로 itemsData 전체 스캔 (8).
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
      // 아래 8) 에서 itemsData 전체 스캔으로 처리 — 여기서는 건너뜀.
    } else {
      unclassifiedKeys.push(id);
    }
  }

  // 8) 오파츠 (Material/Artifact) — 애장품 + 스킬 공용. itemsData 전체 스캔.
  const artifactKeys: string[] = Object.values(itemsData)
    .filter((it) => it.Category === 'Material' && it.SubCategory === 'Artifact')
    .map((it) => String(it.Id));

  if (favorKeys.length > 0) {
    groups.push({
      id: 'gear-favor',
      name: '애장품 — 애착 선물',
      keys: favorKeys.sort(byIdAsc),
      hint: '애장품 강화 시 촉매로 소모되는 선물 아이템.',
    });
  }
  if (artifactKeys.length > 0) {
    groups.push({
      id: 'artifacts',
      name: '오파츠 (스킬·애장품 공용)',
      keys: artifactKeys.sort(byIdAsc),
      hint: '애장품 강화와 스킬 강화에 공용으로 사용되는 아티팩트 조각.',
    });
  }
  if (unclassifiedKeys.length > 0) {
    groups.push({
      id: 'gear-other',
      name: '애장품 — 기타 재료',
      keys: unclassifiedKeys.sort(byIdAsc),
    });
  }

  return groups;
}
