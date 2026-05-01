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

/** SchaleDB 아이템 (items.min.json) */
export interface SchaleDBItem {
  Id: number;
  Name: string;
  Icon: string;
  Rarity?: string;
  /** 최상위 카테고리 — "SecretStone" | "Coin" | "Material" | "Collectible" | "Consumable" | "Favor" | "CharacterExpGrowth" */
  Category?: string;
  /** Material 카테고리의 서브 — "Artifact" | "BookItem" | "CDItem" 등 */
  SubCategory?: string;
}

/** SchaleDB 일반 장비 (equipment.min.json) */
export interface SchaleDBEquipment {
  Id: number;
  Name?: string;             // e.g. "게이밍 헬멧", "게이밍 헬멧 설계도면"
  Category: string;          // "Hat", "Hairpin", "Badge", "Shoes", ...
  Tier: number;              // 1 ~ 10
  MaxLevel: number;          // 크래프트 가능한 장비는 10~70, piece(설계도면)는 1
  Icon: string;
  /** [[materialId, quantity], ...] — 하위 티어 장비/설계도면. piece 에는 존재하지 않음 */
  Recipe?: [number, number][];
  /** 제작 시 크레딧 비용 */
  RecipeCost?: number;
}

/** SchaleDB 지역 설정 — config.min.json 의 Regions 배열 요소 */
export interface SchaleDBRegion {
  StudentMaxLevel: number;
  WeaponMaxLevel: number;
  EquipmentMaxLevel: number[];
  BondMaxLevel: number;
  PotentialMax: number;
}

/** SchaleDB 공통 설정 (config.min.json) */
export interface SchaleDBConfig {
  Regions: SchaleDBRegion[];
}
