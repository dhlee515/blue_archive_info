// 재화 교환형 이벤트 — 순수 계산 함수

export interface RewardSelection {
  /** 보상 인덱스 */
  index: number;
  /** 사용자가 원하는 수량 */
  desiredCount: number;
}

export interface MaterialExchangeInput {
  /** 보유 재화 */
  currentCurrency: number;
  /** 1회 진행 시 획득 재화량 */
  currencyPerRun: number;
  /** 보상 목록 */
  rewards: { name: string; cost: number; maxCount: number }[];
  /** 사용자 선택 */
  selections: RewardSelection[];
}

export interface MaterialExchangeResult {
  /** 총 필요 재화 */
  totalCost: number;
  /** 부족 재화 (음수면 잉여) */
  shortage: number;
  /** 추가 진행 횟수 */
  additionalRuns: number;
  /** 모두 교환 가능 여부 */
  canAfford: boolean;
}

export function calcMaterialExchange(input: MaterialExchangeInput): MaterialExchangeResult {
  const { currentCurrency, currencyPerRun, rewards, selections } = input;

  const totalCost = selections.reduce((sum, sel) => {
    const reward = rewards[sel.index];
    if (!reward) return sum;
    const count = Math.min(Math.max(0, sel.desiredCount), reward.maxCount);
    return sum + reward.cost * count;
  }, 0);

  const shortage = Math.max(0, totalCost - currentCurrency);
  const additionalRuns = currencyPerRun > 0 ? Math.ceil(shortage / currencyPerRun) : 0;
  const canAfford = totalCost <= currentCurrency;

  return {
    totalCost,
    shortage,
    additionalRuns,
    canAfford,
  };
}
