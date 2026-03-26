// 도메인 타입 정의 - 블루 아카이브 제조 시스템

/** 제조 노드 정보 */
export interface CraftingNode {
  id: string;
  name: string;
  tier: 1 | 2 | 3;
  probability: number;
}

/** 제조 노드 아이템 정보 */
export interface CraftingItem {
  id: string;
  name: string;
  nodename: string;
  probability: number;
}
