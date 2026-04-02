import { useState, useEffect, useMemo } from 'react';
import type { CraftingNode, CraftingItem } from '@/types/crafting';
import { CraftingRepository } from '@/repositories/craftingRepository';

// 노드 확률 × 아이템 확률 = 최종 기대 확률
function calcExpectedProbability(nodeProbability: number, itemProbability: number): number {
  return nodeProbability * itemProbability;
}

// 퍼센트 포맷
function formatPercent(value: number): string {
  return (value * 100).toFixed(4) + '%';
}

type Mode = 'node-to-item' | 'item-to-node';

export default function CraftingCalcPage() {
  // 데이터 로딩
  const [tier1Nodes, setTier1Nodes] = useState<CraftingNode[]>([]);
  const [tier2Nodes, setTier2Nodes] = useState<CraftingNode[]>([]);
  const [tier3Nodes, setTier3Nodes] = useState<CraftingNode[]>([]);
  const [tier1Items, setTier1Items] = useState<CraftingItem[]>([]);
  const [tier2Items, setTier2Items] = useState<CraftingItem[]>([]);
  const [tier3Items, setTier3Items] = useState<CraftingItem[]>([]);
  const [loading, setLoading] = useState(true);

  // 모드
  const [mode, setMode] = useState<Mode>('node-to-item');

  // 모드 1: 노드 선택
  const [selectedNode1, setSelectedNode1] = useState('');
  const [selectedNode2, setSelectedNode2] = useState('');
  const [selectedNode3, setSelectedNode3] = useState('');

  // 모드 1: 결과 필터/정렬
  const [tierSort, setTierSort] = useState<'default' | 'asc' | 'desc'>('default');
  const [itemSearch, setItemSearch] = useState('');

  // 모드 2: 아이템 검색
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    async function fetchData() {
      try {
        const [n1, n2, n3, i1, i2, i3] = await Promise.all([
          CraftingRepository.getNodesByTier(1),
          CraftingRepository.getNodesByTier(2),
          CraftingRepository.getNodesByTier(3),
          CraftingRepository.getFirstNodeItems(),
          CraftingRepository.getSecondNodeItems(),
          CraftingRepository.getThirdNodeItems(),
        ]);
        setTier1Nodes(n1);
        setTier2Nodes(n2);
        setTier3Nodes(n3);
        setTier1Items(i1);
        setTier2Items(i2);
        setTier3Items(i3);

        if (n1.length > 0) setSelectedNode1(n1[0].name);
        if (n2.length > 0) setSelectedNode2(n2[0].name);
        if (n3.length > 0) setSelectedNode3(n3[0].name);
      } catch (error) {
        console.error('Failed to fetch crafting data:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // 모드 1: 선택한 노드 조합의 아이템 기대값 계산
  const nodeToItemResults = useMemo(() => {
    if (!selectedNode1 || !selectedNode2 || !selectedNode3) return [];

    const node1 = tier1Nodes.find((n) => n.name === selectedNode1);
    const node2 = tier2Nodes.find((n) => n.name === selectedNode2);
    const node3 = tier3Nodes.find((n) => n.name === selectedNode3);
    if (!node1 || !node2 || !node3) return [];

    const items1 = tier1Items
      .filter((i) => i.nodename === selectedNode1)
      .map((i) => ({
        name: i.name,
        tier: 1 as const,
        nodeName: selectedNode1,
        itemProbability: i.probability,
        expectedProbability: calcExpectedProbability(node1.probability, i.probability),
      }));

    const items2 = tier2Items
      .filter((i) => i.nodename === selectedNode2)
      .map((i) => ({
        name: i.name,
        tier: 2 as const,
        nodeName: selectedNode2,
        itemProbability: i.probability,
        expectedProbability: calcExpectedProbability(node2.probability, i.probability),
      }));

    const items3 = tier3Items
      .filter((i) => i.nodename === selectedNode3)
      .map((i) => ({
        name: i.name,
        tier: 3 as const,
        nodeName: selectedNode3,
        itemProbability: i.probability,
        expectedProbability: calcExpectedProbability(node3.probability, i.probability),
      }));

    return [...items1, ...items2, ...items3].sort(
      (a, b) => b.expectedProbability - a.expectedProbability
    );
  }, [selectedNode1, selectedNode2, selectedNode3, tier1Nodes, tier2Nodes, tier3Nodes, tier1Items, tier2Items, tier3Items]);

  // 모드 1: 필터링 및 정렬된 결과
  const filteredNodeToItemResults = useMemo(() => {
    let results = nodeToItemResults;

    if (itemSearch.trim()) {
      results = results.filter((item) => item.name.includes(itemSearch.trim()));
    }

    if (tierSort === 'asc') {
      results = [...results].sort((a, b) => a.tier - b.tier || b.expectedProbability - a.expectedProbability);
    } else if (tierSort === 'desc') {
      results = [...results].sort((a, b) => b.tier - a.tier || b.expectedProbability - a.expectedProbability);
    }

    return results;
  }, [nodeToItemResults, tierSort, itemSearch]);

  // 모드 2: 아이템 → 최적 노드 추천
  const allItems = useMemo(() => {
    const names = new Set<string>();
    [...tier1Items, ...tier2Items, ...tier3Items].forEach((i) => names.add(i.name));
    return Array.from(names).sort();
  }, [tier1Items, tier2Items, tier3Items]);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return allItems;
    return allItems.filter((name) => name.includes(searchQuery.trim()));
  }, [allItems, searchQuery]);

  const [selectedItem, setSelectedItem] = useState('');

  const itemToNodeResults = useMemo(() => {
    if (!selectedItem) return [];

    const results: {
      tier: number;
      nodeName: string;
      nodeProbability: number;
      itemProbability: number;
      expectedProbability: number;
    }[] = [];

    const tiers = [
      { nodes: tier1Nodes, items: tier1Items, tier: 1 },
      { nodes: tier2Nodes, items: tier2Items, tier: 2 },
      { nodes: tier3Nodes, items: tier3Items, tier: 3 },
    ];

    for (const { nodes, items, tier } of tiers) {
      const matchingItems = items.filter((i) => i.name === selectedItem);
      for (const item of matchingItems) {
        const node = nodes.find((n) => n.name === item.nodename);
        if (node) {
          results.push({
            tier,
            nodeName: node.name,
            nodeProbability: node.probability,
            itemProbability: item.probability,
            expectedProbability: calcExpectedProbability(node.probability, item.probability),
          });
        }
      }
    }

    return results.sort((a, b) => b.expectedProbability - a.expectedProbability);
  }, [selectedItem, tier1Nodes, tier2Nodes, tier3Nodes, tier1Items, tier2Items, tier3Items]);

  if (loading) {
    return <div className="text-center py-12 text-gray-400 dark:text-slate-400">데이터를 불러오는 중...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-extrabold text-blue-900 dark:text-blue-300 mb-6 tracking-tight">제조 노드 기대값 계산기</h1>

      {/* 모드 탭 */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setMode('node-to-item')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            mode === 'node-to-item'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600'
          }`}
        >
          노드 → 아이템 기대값
        </button>
        <button
          onClick={() => setMode('item-to-node')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            mode === 'item-to-node'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600'
          }`}
        >
          아이템 → 최적 노드 추천
        </button>
      </div>

      {/* 모드 1: 노드 → 아이템 기대값 */}
      {mode === 'node-to-item' && (
        <>
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden mb-6">
            <div className="p-6 bg-blue-50 dark:bg-blue-900/30 border-b border-gray-200 dark:border-slate-700">
              <p className="text-sm text-blue-800 dark:text-blue-300 font-medium">
                1차 / 2차 / 3차 노드를 선택하면 해당 조합의 아이템 기대값을 계산합니다.
              </p>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-2">1차 노드</label>
                <select
                  value={selectedNode1}
                  onChange={(e) => setSelectedNode1(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-slate-700 dark:text-slate-100"
                >
                  {tier1Nodes.map((node) => (
                    <option key={node.id} value={node.name}>
                      {node.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-2">2차 노드</label>
                <select
                  value={selectedNode2}
                  onChange={(e) => setSelectedNode2(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-slate-700 dark:text-slate-100"
                >
                  {tier2Nodes.map((node) => (
                    <option key={node.id} value={node.name}>
                      {node.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-2">3차 노드</label>
                <select
                  value={selectedNode3}
                  onChange={(e) => setSelectedNode3(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-slate-700 dark:text-slate-100"
                >
                  {tier3Nodes.map((node) => (
                    <option key={node.id} value={node.name}>
                      {node.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* 요약 카드 */}
          {nodeToItemResults.length > 0 && (
            <>
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-gray-200 dark:border-slate-700 shadow-sm">
                  <span className="block text-sm text-gray-500 dark:text-slate-300 mb-1">1차 노드</span>
                  <span className="text-lg font-bold text-gray-800 dark:text-slate-200">{selectedNode1}</span>
                  <span className="block text-sm text-green-600 dark:text-green-300 mt-1">
                    {formatPercent(tier1Nodes.find((n) => n.name === selectedNode1)?.probability ?? 0)}
                  </span>
                </div>
                <div className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-gray-200 dark:border-slate-700 shadow-sm">
                  <span className="block text-sm text-gray-500 dark:text-slate-300 mb-1">2차 노드</span>
                  <span className="text-lg font-bold text-gray-800 dark:text-slate-200">{selectedNode2}</span>
                  <span className="block text-sm text-blue-600 dark:text-blue-400 mt-1">
                    {formatPercent(tier2Nodes.find((n) => n.name === selectedNode2)?.probability ?? 0)}
                  </span>
                </div>
                <div className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-gray-200 dark:border-slate-700 shadow-sm">
                  <span className="block text-sm text-gray-500 dark:text-slate-300 mb-1">3차 노드</span>
                  <span className="text-lg font-bold text-gray-800 dark:text-slate-200">{selectedNode3}</span>
                  <span className="block text-sm text-purple-600 dark:text-purple-400 mt-1">
                    {formatPercent(tier3Nodes.find((n) => n.name === selectedNode3)?.probability ?? 0)}
                  </span>
                </div>
              </div>

              {/* 아이템 테이블 */}
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
                <div className="p-4 border-b border-gray-200 dark:border-slate-700 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <h2 className="text-lg font-bold text-gray-800 dark:text-slate-200">
                    아이템 기대값 ({filteredNodeToItemResults.length}개)
                  </h2>
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={itemSearch}
                      onChange={(e) => setItemSearch(e.target.value)}
                      className="p-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm dark:bg-slate-700 dark:text-slate-100"
                      placeholder="아이템 검색"
                    />
                    <select
                      value={tierSort}
                      onChange={(e) => setTierSort(e.target.value as 'default' | 'asc' | 'desc')}
                      className="p-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-slate-700 dark:text-slate-100 text-sm"
                    >
                      <option value="default">기대 확률순</option>
                      <option value="asc">티어 오름차순</option>
                      <option value="desc">티어 내림차순</option>
                    </select>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-slate-700 border-b border-gray-200 dark:border-slate-700">
                      <tr>
                        <th className="text-left px-4 py-3 font-bold text-gray-600 dark:text-slate-400">아이템</th>
                        <th className="text-left px-4 py-3 font-bold text-gray-600 dark:text-slate-400">티어</th>
                        <th className="text-left px-4 py-3 font-bold text-gray-600 dark:text-slate-400">노드</th>
                        <th className="text-right px-4 py-3 font-bold text-gray-600 dark:text-slate-400">노드 내 확률</th>
                        <th className="text-right px-4 py-3 font-bold text-gray-600 dark:text-slate-400">최종 기대 확률</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredNodeToItemResults.map((item, idx) => (
                        <tr
                          key={`${item.tier}-${item.name}-${idx}`}
                          className={idx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-gray-50 dark:bg-slate-800/70'}
                        >
                          <td className="px-4 py-2.5 font-medium text-gray-800 dark:text-slate-200">{item.name}</td>
                          <td className="px-4 py-2.5">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              item.tier === 1
                                ? 'bg-green-50 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                                : item.tier === 2
                                  ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                                  : 'bg-purple-50 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
                            }`}>
                              {item.tier}차
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-gray-600 dark:text-slate-400">{item.nodeName}</td>
                          <td className="px-4 py-2.5 text-right text-gray-600 dark:text-slate-400">
                            {formatPercent(item.itemProbability)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-medium text-blue-700 dark:text-blue-300">
                            {formatPercent(item.expectedProbability)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* 모드 2: 아이템 → 최적 노드 추천 */}
      {mode === 'item-to-node' && (
        <>
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden mb-6">
            <div className="p-6 bg-blue-50 dark:bg-blue-900/30 border-b border-gray-200 dark:border-slate-700">
              <p className="text-sm text-blue-800 dark:text-blue-300 font-medium">
                원하는 아이템을 검색하고 선택하면 해당 아이템을 얻기 위한 최적의 노드를 추천합니다.
              </p>
            </div>

            <div className="p-6">
              <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-2">아이템 검색</label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSelectedItem('');
                }}
                className="w-full p-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none mb-3 dark:bg-slate-700 dark:text-slate-100"
                placeholder="아이템 이름을 입력하세요"
              />

              {filteredItems.length > 0 && (
                <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-slate-700 rounded-lg">
                  {filteredItems.map((name) => (
                    <button
                      key={name}
                      onClick={() => {
                        setSelectedItem(name);
                        setSearchQuery(name);
                      }}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors ${
                        selectedItem === name ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium' : 'text-gray-700 dark:text-slate-300'
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}

              {searchQuery.trim() && filteredItems.length === 0 && (
                <p className="text-sm text-gray-400 dark:text-slate-400 mt-2">일치하는 아이템이 없습니다.</p>
              )}
            </div>
          </div>

          {/* 결과 */}
          {selectedItem && itemToNodeResults.length > 0 && (
            <>
              {/* 요약 카드 */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-gray-200 dark:border-slate-700 shadow-sm">
                  <span className="block text-sm text-gray-500 dark:text-slate-300 mb-1">선택한 아이템</span>
                  <span className="text-lg font-bold text-gray-800 dark:text-slate-200">{selectedItem}</span>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg border border-blue-200 dark:border-blue-800 shadow-sm">
                  <span className="block text-sm text-blue-600 dark:text-blue-400 font-bold mb-1">최적 노드</span>
                  <span className="text-lg font-bold text-blue-700 dark:text-blue-300">
                    {itemToNodeResults[0].tier}차 - {itemToNodeResults[0].nodeName}
                  </span>
                  <span className="block text-sm text-blue-500 dark:text-blue-400 mt-1">
                    기대 확률: {formatPercent(itemToNodeResults[0].expectedProbability)}
                  </span>
                </div>
              </div>

              {/* 상세 테이블 */}
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
                <div className="p-4 border-b border-gray-200 dark:border-slate-700">
                  <h2 className="text-lg font-bold text-gray-800 dark:text-slate-200">
                    "{selectedItem}" 획득 가능 노드 ({itemToNodeResults.length}개)
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-slate-700 border-b border-gray-200 dark:border-slate-700">
                      <tr>
                        <th className="text-left px-4 py-3 font-bold text-gray-600 dark:text-slate-400">티어</th>
                        <th className="text-left px-4 py-3 font-bold text-gray-600 dark:text-slate-400">노드</th>
                        <th className="text-right px-4 py-3 font-bold text-gray-600 dark:text-slate-400">노드 확률</th>
                        <th className="text-right px-4 py-3 font-bold text-gray-600 dark:text-slate-400">노드 내 아이템 확률</th>
                        <th className="text-right px-4 py-3 font-bold text-gray-600 dark:text-slate-400">최종 기대 확률</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemToNodeResults.map((result, idx) => (
                        <tr
                          key={`${result.tier}-${result.nodeName}-${idx}`}
                          className={idx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-gray-50 dark:bg-slate-800/70'}
                        >
                          <td className="px-4 py-2.5">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              result.tier === 1
                                ? 'bg-green-50 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                                : result.tier === 2
                                  ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                                  : 'bg-purple-50 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
                            }`}>
                              {result.tier}차
                            </span>
                          </td>
                          <td className="px-4 py-2.5 font-medium text-gray-800 dark:text-slate-200">{result.nodeName}</td>
                          <td className="px-4 py-2.5 text-right text-gray-600 dark:text-slate-400">
                            {formatPercent(result.nodeProbability)}
                          </td>
                          <td className="px-4 py-2.5 text-right text-gray-600 dark:text-slate-400">
                            {formatPercent(result.itemProbability)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-medium text-blue-700 dark:text-blue-300">
                            {formatPercent(result.expectedProbability)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {selectedItem && itemToNodeResults.length === 0 && (
            <div className="text-center py-12 text-gray-400 dark:text-slate-400 border border-dashed border-gray-300 dark:border-slate-600 rounded-lg">
              해당 아이템을 획득할 수 있는 노드가 없습니다.
            </div>
          )}
        </>
      )}
    </div>
  );
}
