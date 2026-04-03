// SchaleDB 학생 데이터 fetch + 프로젝트 타입 매핑

import { fetchSchaleDB } from '@/lib/schaledbCache';
import { studentPortraitUrl } from '@/lib/schaledbImage';
import type { SchaleDBStudent, SchaleDBSkill } from '@/types/schaledb';
import type {
  Student,
  StudentDetail,
  StudentSkill,
  AttackType,
  StudentRole,
  StudentRoleType,
  StudentPosition,
  StudentWeaponType,
} from '@/types/student';

// --- 매핑 테이블 ---

const BULLET_TYPE_MAP: Record<string, AttackType> = {
  Explosion: 'Explosive',
  Pierce: 'Piercing',
  Mystic: 'Mystic',
  Sonic: 'Sonic',
};

const SQUAD_TYPE_MAP: Record<string, StudentRole> = {
  Main: 'Striker',
  Support: 'Special',
};

const TACTIC_ROLE_MAP: Record<string, StudentRoleType> = {
  DamageDealer: 'Dealer',
  Tanker: 'Tank',
  Healer: 'Healer',
  Supporter: 'Supporter',
  Vehicle: 'Vehicle',
};

/** schaledb.com은 객체 형태 { "10000": {...}, ... }로 반환 */
type SchaleDBStudentMap = Record<string, SchaleDBStudent>;

export class SchaleDBStudentRepository {
  /** 전체 학생 목록 (기본 정보) */
  static async getStudents(): Promise<Student[]> {
    const raw = await fetchSchaleDB<SchaleDBStudentMap>('students');
    return Object.values(raw).map(mapToStudent);
  }

  /** 학생 상세 정보 (schaleId로 조회) */
  static async getStudentById(schaleId: number): Promise<StudentDetail | null> {
    const raw = await fetchSchaleDB<SchaleDBStudentMap>('students');
    const found = raw[String(schaleId)];
    if (!found) return null;
    return mapToStudentDetail(found);
  }

  /** 전체 학생 수 */
  static async getStudentCount(): Promise<number> {
    const raw = await fetchSchaleDB<SchaleDBStudentMap>('students');
    return Object.keys(raw).length;
  }
}

// --- 매핑 함수 ---

function mapToStudent(s: SchaleDBStudent): Student {
  return {
    id: String(s.Id),
    schaleId: s.Id,
    name: s.Name,
    school: s.School,
    role: SQUAD_TYPE_MAP[s.SquadType] ?? 'Striker',
    attackType: BULLET_TYPE_MAP[s.BulletType] ?? 'Explosive',
    armorType: s.ArmorType,
    rarity: Math.min(3, Math.max(1, s.StarGrade)) as 1 | 2 | 3,
    imageUrl: studentPortraitUrl(s.Id),
    position: s.Position as StudentPosition,
    weaponType: s.WeaponType as StudentWeaponType,
    tacticRole: TACTIC_ROLE_MAP[s.TacticRole] ?? 'Dealer',
    isLimited: s.IsLimited > 0,
  };
}

function mapToStudentDetail(s: SchaleDBStudent): StudentDetail {
  const base = mapToStudent(s);

  return {
    ...base,
    familyName: s.FamilyName,
    personalName: s.PersonalName,
    club: s.Club,
    schoolYear: s.SchoolYear,
    characterAge: s.CharacterAge,
    birthday: s.Birthday,
    height: s.CharHeightMetric,
    illustrator: s.Illustrator,
    designer: s.Designer,
    profile: s.ProfileIntroduction,
    hobby: s.Hobby,
    stats: {
      hp: s.MaxHP100,
      attack: s.AttackPower100,
      defense: s.DefensePower100,
      healPower: s.HealPower100,
      accuracy: s.AccuracyPoint,
      evasion: s.DodgePoint,
      critical: s.CriticalPoint,
      criticalDamage: s.CriticalDamageRate,
      stability: s.StabilityPoint,
      range: s.Range,
      ammoCount: s.AmmoCount,
      ammoCost: s.AmmoCost,
      regenCost: s.RegenCost,
    },
    skills: mapSkills(s.Skills),
    weapon: {
      name: s.Weapon?.Name ?? '',
      description: s.Weapon?.Desc ?? '',
      weaponType: s.WeaponType as StudentWeaponType,
      imageId: s.WeaponImg,
    },
    terrain: {
      street: s.StreetBattleAdaptation,
      outdoor: s.OutdoorBattleAdaptation,
      indoor: s.IndoorBattleAdaptation,
    },
  };
}

/** Skills 객체 키 → StudentSkillType 매핑 순서 */
const SKILL_KEY_ORDER: { key: string; type: 'EX' | 'Normal' | 'Passive' | 'Sub' }[] = [
  { key: 'Ex', type: 'EX' },
  { key: 'Normal', type: 'Normal' },
  { key: 'Passive', type: 'Passive' },
  { key: 'WeaponPassive', type: 'Passive' },
  { key: 'Public', type: 'Sub' },
  { key: 'GearPublic', type: 'Sub' },
  { key: 'ExtraPassive', type: 'Sub' },
];

function mapSkills(skills: Record<string, SchaleDBSkill> | SchaleDBSkill[] | undefined): StudentSkill[] {
  if (!skills) return [];

  // 배열 형태 (구버전 호환)
  if (Array.isArray(skills)) {
    return skills.map((sk, idx) => ({
      name: sk.Name ?? `스킬 ${idx + 1}`,
      description: resolveSkillDesc(sk.Desc, sk.Parameters),
      type: 'Normal' as const,
      icon: sk.Icon ?? '',
      cost: sk.Cost,
    }));
  }

  // 객체 형태 (신버전)
  const result: StudentSkill[] = [];
  for (const { key, type } of SKILL_KEY_ORDER) {
    const sk = skills[key];
    if (!sk) continue;
    result.push({
      name: sk.Name ?? key,
      description: resolveSkillDesc(sk.Desc, sk.Parameters),
      type,
      icon: sk.Icon ?? '',
      cost: sk.Cost,
    });
  }
  return result;
}

/** 스킬 설명 태그를 한국어로 치환 */
const STAT_TAG_LABELS: Record<string, string> = {
  ATK: '공격력',
  DEF: '방어력',
  MAXHP: '최대 HP',
  HIT: '명중',
  Dodge: '회피',
  CriticalChance: '치명타 확률',
  CriticalChanceResistPoint: '치명타 저항',
  CriticalDamage: '치명타 데미지',
  CriticalDamageRateResist: '치명타 데미지 저항',
  HealPower: '치유력',
  HealEffectiveness: '치유 효과',
  DotHeal: '지속 치유',
  AttackSpeed: '공격 속도',
  MoveSpeed: '이동 속도',
  Range: '사거리',
  AmmoCount: '장탄수',
  Stability: '안정성',
  Penetration: '관통',
  DamageRatio: '피해량',
  DamagedRatio: '받는 피해량',
  Shield: '보호막',
  BlockRate: '차단율',
  CostChange: '코스트 변동',
  CostOverload: '코스트 과부하',
  CostRegen: '코스트 회복',
  OppressionPower: '제압력',
  OppressionResist: '제압 저항',
  EnhanceBasicsDamageRate: '기본 스킬 피해량',
  EnhanceExDamageRate: 'EX 스킬 피해량',
  EnhanceExplosionRate: '폭발 피해량',
  EnhancePierceRate: '관통 피해량',
  EnhanceMysticRate: '신비 피해량',
  EnhanceSonicRate: '진동 피해량',
  ExtendDebuffDuration: '디버프 지속시간',
  NinjaWalking: '은신',
  AidAttude: '지원 태도',
  AidAttitude: '지원 태도',
};

/** 스킬 설명의 <?1>, <?2> 및 <b:StatName> 태그를 치환 */
function resolveSkillDesc(desc?: string, params?: string[][]): string {
  if (!desc) return '';

  // 1. <b:StatName> 또는 <b:StatName='텍스트'> → 한국어 스탯명
  let result = desc.replace(/<b:(\w+)(?:='([^']*)')?>/g, (_match, tag, inlineText) => {
    if (inlineText) return inlineText;
    return STAT_TAG_LABELS[tag] ?? tag;
  });

  // 2. <?1>, <?2> → Parameters 최대 레벨 값
  if (params && params.length > 0) {
    result = result.replace(/<\?(\d+)>/g, (_match, numStr) => {
      const idx = Number(numStr) - 1;
      const paramArr = params[idx];
      if (!paramArr || paramArr.length === 0) return '?';
      return paramArr[paramArr.length - 1];
    });
  }

  return result;
}
