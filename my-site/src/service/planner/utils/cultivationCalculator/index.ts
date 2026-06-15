// 육성 플래너 — 필요 재료 계산 (순수 함수, domain 별 분리).
//
// 외부 사용 = 4개 항목 (aggregateAllWithBond, computeDeficit, BondPlan, MaterialBreakdown).
// 나머지 domain 함수는 내부 helper 로 사용 — 필요 시 sub-path 로 직접 import.
//
// 크레딧 / 경험치 synthetic 키:
//   - 'credit'       : 크레딧
//   - 'student_exp'  : 학생 경험치
//   - 'weapon_exp'   : 고유무기 경험치
// UI 레이어에서 숫자 vs synthetic 키를 구분해 렌더합니다.

export {
  aggregateAllWithBond,
  aggregatePerStudent,
  aggregateAll,
  computeDeficit,
  type BondAwareAggregate,
  type BondPlan,
  type MaterialBreakdown,
} from './aggregate';
export { type EquipmentMap } from './_shared';
