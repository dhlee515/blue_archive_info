// SchaleDB 원본 JSON 타입 정의

/** SchaleDB 학생 원본 데이터 (kr/students.min.json) */
export interface SchaleDBStudent {
  Id: number;
  IsReleased: [boolean, boolean, boolean]; // [JP, Global, KR]
  DefaultOrder: number;
  PathName: string;
  DevName: string;
  Name: string;
  School: string;
  Club: string;
  StarGrade: number;
  SquadType: 'Main' | 'Support';
  TacticRole: string;
  Position: string;
  BulletType: 'Explosion' | 'Pierce' | 'Mystic' | 'Sonic';
  ArmorType: 'LightArmor' | 'HeavyArmor' | 'Unarmed' | 'ElasticArmor';
  StreetBattleAdaptation: number;
  OutdoorBattleAdaptation: number;
  IndoorBattleAdaptation: number;
  WeaponType: string;
  WeaponImg: string;
  Cover: boolean;
  Equipment: string[];
  FamilyName: string;
  PersonalName: string;
  SchoolYear: string;
  CharacterAge: string;
  Birthday: string;
  ProfileIntroduction: string;
  Hobby: string;
  CharacterVoice: string;
  Illustrator: string;
  Designer: string;
  CharHeightMetric: string;
  CharHeightImperial: string;
  StabilityPoint: number;
  AttackPower1: number;
  AttackPower100: number;
  MaxHP1: number;
  MaxHP100: number;
  DefensePower1: number;
  DefensePower100: number;
  HealPower1: number;
  HealPower100: number;
  DodgePoint: number;
  AccuracyPoint: number;
  CriticalPoint: number;
  CriticalDamageRate: number;
  AmmoCount: number;
  AmmoCost: number;
  Range: number;
  RegenCost: number;
  Skills: Record<string, SchaleDBSkill> | SchaleDBSkill[];
  FavorStatType: string[];
  FavorStatValue: number[][];
  FavorAlts: number[];
  MemoryLobby: number[];
  IsLimited: number;
  Weapon: SchaleDBWeapon;
  Gear: SchaleDBGear;
}

/** SchaleDB 스킬 */
export interface SchaleDBSkill {
  SkillType: string;
  Effects: SchaleDBSkillEffect[];
  Name?: string;
  Desc?: string;
  Parameters?: string[][];
  Cost?: number[];
  Icon?: string;
}

export interface SchaleDBSkillEffect {
  Type: string;
  Hits?: number[];
  Scale?: number[];
  Frames?: Record<string, unknown>;
  CriticalCheck?: string;
}

/** SchaleDB 무기 */
export interface SchaleDBWeapon {
  Name: string;
  Desc: string;
  AdaptationType: string;
  AdaptationValue: number;
  AttackPower1: number;
  AttackPower100: number;
  MaxHP1: number;
  MaxHP100: number;
  HealPower1: number;
  HealPower100: number;
  StatLevelUpType: string;
}

/** SchaleDB 장비 (고유 장비) */
export interface SchaleDBGear {
  Released?: [boolean, boolean, boolean];
  StatType?: string[];
  StatValue?: number[][];
  Name?: string;
  Desc?: string;
  TierUpMaterial?: number[][];
  TierUpMaterialAmount?: number[][];
}
