// 도메인 타입 정의 - 블루 아카이브 캐릭터/학생

/** 학생 기본 정보 */
export interface Student {
  id: string;
  schaleId: number;
  name: string;
  school: string;
  role: StudentRole;
  attackType: AttackType;
  armorType: ArmorType;
  rarity: 1 | 2 | 3;
  imageUrl: string;
  position: StudentPosition;
  weaponType: StudentWeaponType;
  tacticRole: StudentRoleType;
  isLimited: boolean;
}

/** 전투 역할 */
export type StudentRole = 'Striker' | 'Special';

/** 공격 속성 */
export type AttackType = 'Explosive' | 'Piercing' | 'Mystic' | 'Sonic';

/** 방어 속성 */
export type ArmorType = 'LightArmor' | 'HeavyArmor' | 'Unarmed' | 'ElasticArmor';

/** 학생 스킬 */
export type StudentSkillType = 'EX' | 'Normal' | 'Passive' | 'Sub';

/** 학생 무기 */
export type StudentWeaponType = 'SMG' | 'AR' | 'MG' | 'SG' | 'HG' | 'SR' | 'RL' | 'GL' | 'MT' | 'RG' | 'FT';

/** 학생 포지션 */
export type StudentPosition = 'Front' | 'Middle' | 'Back';

/** 학생 역할군 */
export type StudentRoleType = 'Tank' | 'Healer' | 'Dealer' | 'Supporter' | 'Vehicle';

/** 학생 상세 정보 (Student 확장) */
export interface StudentDetail extends Student {
  familyName: string;
  personalName: string;
  club: string;
  schoolYear: string;
  characterAge: string;
  birthday: string;
  height: string;
  illustrator: string;
  designer: string;
  profile: string;
  hobby: string;
  stats: StudentStats;
  skills: StudentSkill[];
  weapon: StudentWeapon;
  terrain: StudentTerrain;
}

/** 기본 스탯 */
export interface StudentStats {
  hp: number;
  attack: number;
  defense: number;
  healPower: number;
  accuracy: number;
  evasion: number;
  critical: number;
  criticalDamage: number;
  stability: number;
  range: number;
  ammoCount: number;
  ammoCost: number;
  regenCost: number;
}

/** 스킬 정보 */
export interface StudentSkill {
  name: string;
  description: string;
  type: StudentSkillType;
  icon: string;
  cost?: number[];
}

/** 무기 정보 */
export interface StudentWeapon {
  name: string;
  description: string;
  weaponType: StudentWeaponType;
  imageId: string;
}

/** 지형 적응도 (S/A/B/C/D) */
export interface StudentTerrain {
  street: number;
  outdoor: number;
  indoor: number;
}
