// 도메인 타입 정의 - 육성 플래너

/** 학생 레벨 범위 */
export interface LevelRange {
  /** 현재 레벨 (1 ~ StudentMaxLevel) */
  current: number;
  /** 목표 레벨 */
  target: number;
}

/** 애장품(Gear) 티어 범위. 게임상 T1~T2 가 max (해금 + 1단계 강화). */
export interface GearRange {
  /** 현재 티어 (0 = 미해금, 1~2) */
  currentTier: number;
  /** 목표 티어 */
  targetTier: number;
}

/** 고유무기(Weapon) 레벨 범위 */
export interface WeaponRange {
  /** 현재 무기 레벨 (0 = 미해금, 1~WeaponMaxLevel) */
  currentLevel: number;
  /** 목표 무기 레벨 */
  targetLevel: number;
}

/**
 * 학생 성급 + 고유무기 성급을 통합한 1~8 단계 범위.
 * 1~4 = 학생 성급 (1~4성), 5 = 5성 달성 (전무 1성 해금), 6~8 = 전무 2~4성.
 * 모든 단계는 학생 고유 엘레프 (items id == student id) 를 사용.
 */
export interface WeaponStarRange {
  /** 현재 단계 (1~8) */
  current: number;
  /** 목표 단계 (1~8) */
  target: number;
}

/**
 * 일반 장비 슬롯별 티어 배열.
 * 배열 길이는 학생별 가변 — SchaleDBStudent.Equipment 의 길이와 일치 (보통 3).
 * 각 원소는 티어 값 (1 ~ 10).
 */
export type EquipmentTiers = number[];

/** 단일 스킬의 현재/목표 레벨 */
export interface SkillRange {
  current: number;
  target: number;
}

/** 4개 스킬 트랙. EX 1~5, 그 외 1~10. */
export interface SkillsRange {
  /** EX 스킬 (1~5) */
  ex: SkillRange;
  /** 기본 스킬 (1~10) */
  normal: SkillRange;
  /** 강화 스킬 (1~10) */
  passive: SkillRange;
  /** 서브 스킬 (1~10) */
  sub: SkillRange;
}

/** 단일 스탯 잠재력 (WB) 단계. 0 = 미강화, 1~25. */
export interface PotentialRange {
  current: number;
  target: number;
}

/** 3개 스탯 잠재력 단계 (체력/공격/치명) */
export interface PotentialsRange {
  hp: PotentialRange;
  attack: PotentialRange;
  crit: PotentialRange;
}

/** 학생별 목표치 전체 — planner_students.targets 에 jsonb 직렬화 */
export interface PlannerTargets {
  level: LevelRange;
  gear?: GearRange;
  weapon?: WeaponRange;
  /** 학생 성급 + 전무 성급 통합 (1~8 단계, 엘레프 소비) */
  weaponStar?: WeaponStarRange;
  equipment?: {
    current: EquipmentTiers;
    target: EquipmentTiers;
  };
  /** EX / 기본 / 강화 / 서브 스킬 레벨 */
  skills?: SkillsRange;
  /** 잠재력 (WB) 강화 — 체력/공격/치명 각각 0~25 단계 */
  potentials?: PotentialsRange;
  // 향후 확장: bond
}

/** 플래너에 담긴 학생 1건 */
export interface PlannerStudent {
  id: string;
  userId: string;
  /** SchaleDB Id */
  studentId: number;
  targets: PlannerTargets;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** 보유 재화 인벤토리 맵 — { itemId(string): quantity } */
export type InventoryMap = Record<string, number>;

/** 집계된 필요 재료 맵 — { itemId(string): requiredQuantity } */
export type RequiredMaterials = Record<string, number>;

/** 부족 리포트 */
export interface DeficitReport {
  /** 필요 재료 합산 */
  required: RequiredMaterials;
  /** 사용자 입력 보유량 */
  owned: InventoryMap;
  /** max(0, required - owned) */
  deficit: RequiredMaterials;
}
