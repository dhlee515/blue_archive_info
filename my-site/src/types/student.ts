// 도메인 타입 정의 - 블루 아카이브 캐릭터/학생

/** 학생 기본 정보 */
export interface Student {
  id: string;
  name: string;
  school: string;
  role: StudentRole;
  attackType: AttackType;
  armorType: ArmorType;
  rarity: 1 | 2 | 3;
  imageUrl: string;
}

/** 전투 역할 */
export type StudentRole = 'Striker' | 'Special';

/** 공격 속성 */
export type AttackType = 'Explosive' | 'Piercing' | 'Mystic' | 'Sonic' | 'Decomposition';

/** 방어 속성 */
export type ArmorType = 'LightArmor' | 'HeavyArmor' | 'Unarmed' | 'ElasticArmor' | 'Complex';

/** 학생 스킬 */
export type StudentSkillType = 'EX' | 'Normal' | 'Passive' | 'Sub';

/** 학생 무기 */
export type StudentWeaponType = 'SMG' | 'AR' | 'MG' | 'SG' | 'HG' | 'SR' | 'RL' | 'GL' | 'MT' | 'RG' | 'FT';

/** 학생 포지션 */
export type StudentPosition = 'Front' | 'Middle' | 'Back';

/** 학생 역할군 */
export type StudentRoleType = 'Tank' | 'Healer' | 'Dealer' | 'Supporter' | 'Tectical Support'

/** 학생 상세 정보 (Student 확장) */
export interface StudentDetail extends Student {
  profile: string;
  stats: StudentStats;
  skills: StudentSkill[];
}

/** 기본 스탯 */
export interface StudentStats {
  hp: number;
  attack: number;
  defense: number;
  healPower: number;
}

/** 스킬 정보 */
export interface StudentSkill {
  name: string;
  description: string;
  type: StudentSkillType;
}
