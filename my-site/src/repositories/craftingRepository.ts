import type { CraftingNode, CraftingItem } from '@/types/crafting';
import nodesData from '@/data/crafting/crafting_nodes.json';
import firstNodeItems from '@/data/crafting/crafting_first_node_items.json';
import secondNodeItems from '@/data/crafting/crafting_second_node_items.json';
import thirdNodeItems from '@/data/crafting/crafting_third_node_items.json';

export class CraftingRepository {
  /**
   * 특정 티어의 노드 목록을 가져옵니다.
   */
  static async getNodesByTier(tier: 1 | 2 | 3): Promise<CraftingNode[]> {
    return (nodesData as CraftingNode[]).filter((node) => node.tier === tier);
  }

  /**
   * 1차 노드 아이템 목록을 가져옵니다.
   */
  static async getFirstNodeItems(): Promise<CraftingItem[]> {
    return firstNodeItems as CraftingItem[];
  }

  /**
   * 2차 노드 아이템 목록을 가져옵니다.
   */
  static async getSecondNodeItems(): Promise<CraftingItem[]> {
    return secondNodeItems as CraftingItem[];
  }

  /**
   * 3차 노드 아이템 목록을 가져옵니다.
   */
  static async getThirdNodeItems(): Promise<CraftingItem[]> {
    return thirdNodeItems as CraftingItem[];
  }

  /**
   * 특정 티어, 특정 노드명에 해당하는 아이템 목록을 가져옵니다.
   */
  static async getItemsByNodeName(tier: 1 | 2 | 3, nodeName: string): Promise<CraftingItem[]> {
    const itemsMap: Record<number, CraftingItem[]> = {
      1: firstNodeItems as CraftingItem[],
      2: secondNodeItems as CraftingItem[],
      3: thirdNodeItems as CraftingItem[],
    };
    return itemsMap[tier].filter((item) => item.nodename === nodeName);
  }
}
