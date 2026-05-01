// 도메인 타입 정의 - 육성 플래너

/** 학생 레벨 범위 */
export interface LevelRange {
  /** 현재 레벨 (1 ~ StudentMaxLevel) */
  current: number;
  /** 목표 레벨 */
  target: number;
}

/** 고유장비(Gear) 티어 범위 */
export interface GearRange {
  /** 현재 티어 (0 = 미해금, 1~3) */
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
 * 일반 장비 슬롯별 티어 배열.
 * 배열 길이는 학생별 가변 — SchaleDBStudent.Equipment 의 길이와 일치 (보통 3).
 * 각 원소는 티어 값 (1 ~ 10).
 */
export type EquipmentTiers = number[];

/** 학생별 목표치 전체 — planner_students.targets 에 jsonb 직렬화 */
export interface PlannerTargets {
  level: LevelRange;
  gear?: GearRange;
  weapon?: WeaponRange;
  equipment?: {
    current: EquipmentTiers;
    target: EquipmentTiers;
  };
  // 향후 확장: skills, potential, bond
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
