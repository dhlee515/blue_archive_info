// SchaleDB 학생 데이터 fetch + 프로젝트 타입 매핑

import { fetchSchaleDB } from '@/lib/schaledbCache';
import { studentPortraitUrl } from '@/lib/schaledbImage';
import type { SchaleDBStudent } from '@/types/schaledb';
import type {
  Student,
  StudentDetail,
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
    skills: (s.Skills ?? []).map((sk, idx) => ({
      name: sk.Name ?? `스킬 ${idx + 1}`,
      description: sk.Desc ?? '',
      type: mapSkillType(sk.SkillType),
      icon: sk.Icon ?? '',
      cost: sk.Cost,
    })),
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

function mapSkillType(type: string): 'EX' | 'Normal' | 'Passive' | 'Sub' {
  if (type === 'ex') return 'EX';
  if (type === 'normal') return 'Normal';
  if (type === 'passive') return 'Passive';
  if (type === 'sub') return 'Sub';
  return 'Normal';
}
