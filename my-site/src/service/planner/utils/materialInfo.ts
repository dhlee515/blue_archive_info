// RequiredMaterials 의 키를 표시 가능한 이름/아이콘으로 매핑합니다.
//
// 키 종류:
//  - synthetic: 'credit' | 'student_exp' | 'weapon_exp'  → 아이콘 없이 라벨
//  - prefix 키: 'report:<id>' / 'wpart:<id>' / 'wstone:<id>'  → exp_conversion.json lookup
//  - 숫자 문자열: items.min.json / equipment.min.json 의 Id lookup

import type { SchaleDBEquipment, SchaleDBItem } from '@/types/schaledb';
import { itemIconUrl, equipmentImageUrl } from '@/lib/schaledbImage';
import { EXP_ITEM_LOOKUP } from './expConversion';

export interface MaterialInfo {
  key: string;
  name: string;
  iconUrl: string | null;
  /** synthetic (크레딧/EXP) 여부 — 정렬/그룹핑 용 */
  isSynthetic: boolean;
}

const SYNTHETIC_LABELS: Record<string, string> = {
  credit: '크레딧',
  student_exp: '학생 경험치',
  weapon_exp: '무기 경험치',
};

/** synthetic 키별 SchaleDB 이미지 (없으면 placeholder 표시) */
const SYNTHETIC_ICON_NAMES: Record<string, string> = {
  credit: 'currency_icon_gold',
};

export function getMaterialInfo(
  key: string,
  itemsData: Record<string, SchaleDBItem>,
  equipmentData: Record<string, SchaleDBEquipment>,
): MaterialInfo {
  const synthetic = SYNTHETIC_LABELS[key];
  if (synthetic) {
    const iconName = SYNTHETIC_ICON_NAMES[key];
    return {
      key,
      name: synthetic,
      iconUrl: iconName ? itemIconUrl(iconName) : null,
      isSynthetic: true,
    };
  }

  // prefix 키 (report: / wpart: / wstone:) — 정적 환산 데이터에서 조회
  const expItem = EXP_ITEM_LOOKUP.get(key);
  if (expItem) {
    const isReport = key.startsWith('report:');
    return {
      key,
      name: expItem.name,
      iconUrl: isReport ? itemIconUrl(expItem.icon) : equipmentImageUrl(expItem.icon),
      isSynthetic: false,
    };
  }

  const item = itemsData[key];
  if (item) {
    return {
      key,
      name: item.Name,
      iconUrl: item.Icon ? itemIconUrl(item.Icon) : null,
      isSynthetic: false,
    };
  }

  const eq = equipmentData[key];
  if (eq) {
    const isPiece = !eq.Recipe && eq.MaxLevel === 1;
    const baseName = eq.Name ?? `${eq.Category} T${eq.Tier}`;
    // piece(설계도면)는 티어 prefix 추가. 단 T0 = 만능 설계도(이미 Name에 표기)는 그대로.
    const displayName = isPiece && eq.Tier > 0 ? `T${eq.Tier} ${baseName}` : baseName;
    return {
      key,
      name: displayName,
      iconUrl: eq.Icon ? equipmentImageUrl(eq.Icon) : null,
      isSynthetic: false,
    };
  }

  return { key, name: `#${key}`, iconUrl: null, isSynthetic: false };
}
