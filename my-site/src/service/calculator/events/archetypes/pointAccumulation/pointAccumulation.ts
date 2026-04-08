// 포인트 누적형 이벤트 — 순수 계산 함수

export interface PointAccumulationInput {
  /** 현재 보유 포인트 */
  currentPoints: number;
  /** 일일 평균 획득 포인트 */
  dailyAverage: number;
  /** 목표 포인트 */
  targetPoints: number;
  /** 종료일 (ISO) */
  endDate: string;
}

export interface PointAccumulationResult {
  /** 부족한 포인트 (음수면 초과) */
  remainingPoints: number;
  /** 남은 일수 (오늘 포함) */
  daysLeft: number;
  /** 일일 필요 포인트 */
  dailyRequired: number;
  /** 일일 평균 기준 달성 가능 여부 */
  canAchieve: boolean;
  /** 일일 평균 기준 예상 도달일 */
  expectedDate: string | null;
}

export function calcPointAccumulation(input: PointAccumulationInput): PointAccumulationResult {
  const { currentPoints, dailyAverage, targetPoints, endDate } = input;

  const remainingPoints = Math.max(0, targetPoints - currentPoints);

  // 남은 일수 계산 (오늘 포함, 종료일까지)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysLeft = Math.max(0, Math.ceil((end.getTime() - today.getTime()) / msPerDay) + 1);

  const dailyRequired = daysLeft > 0 ? Math.ceil(remainingPoints / daysLeft) : remainingPoints;

  const canAchieve = dailyAverage > 0 && dailyAverage * daysLeft >= remainingPoints;

  // 예상 도달일 (일일 평균이 0보다 클 때만)
  let expectedDate: string | null = null;
  if (remainingPoints === 0) {
    expectedDate = today.toISOString().slice(0, 10);
  } else if (dailyAverage > 0) {
    const daysNeeded = Math.ceil(remainingPoints / dailyAverage);
    const expected = new Date(today);
    expected.setDate(expected.getDate() + daysNeeded);
    expectedDate = expected.toISOString().slice(0, 10);
  }

  return {
    remainingPoints,
    daysLeft,
    dailyRequired,
    canAchieve,
    expectedDate,
  };
}
