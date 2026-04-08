import { useState, useMemo, useCallback } from 'react';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import type { EventConfig, CardType } from '@/types/event';
import CardGrid from './CardGrid';
import CardPool from './CardPool';

interface Props {
  config: EventConfig;
}

export default function CardMatchingForm({ config }: Props) {
  // 디스크리미네이티드 유니언 narrowing
  if (config.archetype !== 'card-matching') {
    return <div className="text-red-500">잘못된 이벤트 타입입니다.</div>;
  }

  const { gridSize, cardTypes } = config;

  const [gridState, setGridState] = useState<(string | null)[]>(() =>
    Array(gridSize).fill(null),
  );

  const cardMap = useMemo(() => {
    const map = new Map<string, CardType>();
    for (const c of cardTypes) map.set(c.id, c);
    return map;
  }, [cardTypes]);

  /** 카드별 그리드 배치 개수 (풀에서 한도 초과 시 비활성화 용도) */
  const placedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const id of gridState) {
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [gridState]);

  const MAX_PER_CARD = 2;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const overData = over.data.current as { cellIndex?: number } | undefined;
    const targetIndex = overData?.cellIndex;
    if (targetIndex === undefined) return;

    const activeData = active.data.current as
      | { cardId: string; from: 'pool' | 'grid'; gridIndex?: number }
      | undefined;
    if (!activeData) return;

    setGridState((prev) => {
      const next = [...prev];

      if (activeData.from === 'grid' && activeData.gridIndex !== undefined) {
        // 그리드 → 그리드 이동: 두 셀 swap (수량 제한 영향 없음)
        const sourceIndex = activeData.gridIndex;
        if (sourceIndex === targetIndex) return prev;
        const tmp = next[targetIndex];
        next[targetIndex] = next[sourceIndex];
        next[sourceIndex] = tmp;
      } else {
        // 풀 → 그리드: 빈 셀에만 배치 가능 + 한도(2장) 체크
        if (next[targetIndex] !== null) return prev;
        const currentCount = prev.filter((id) => id === activeData.cardId).length;
        if (currentCount >= MAX_PER_CARD) return prev;
        next[targetIndex] = activeData.cardId;
      }

      return next;
    });
  }, []);

  const handleRemove = useCallback((index: number) => {
    setGridState((prev) => {
      const next = [...prev];
      next[index] = null;
      return next;
    });
  }, []);

  const handleReset = () => {
    setGridState(Array(gridSize).fill(null));
  };

  const filledCount = gridState.filter((c) => c !== null).length;

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="space-y-6">
        {/* 그리드 영역 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-gray-700 dark:text-slate-300">
              카드 위치 ({filledCount}/{gridSize})
            </h3>
            <button
              type="button"
              onClick={handleReset}
              className="px-3 py-1 text-xs font-medium bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-200 border border-gray-300 dark:border-slate-600 rounded hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
            >
              초기화
            </button>
          </div>
          <p className="text-xs text-gray-500 dark:text-slate-400 mb-3">
            카드 우측 상단의 × 버튼으로 제거하고, 드래그하면 위치를 교환합니다.
          </p>
          <CardGrid gridState={gridState} cardMap={cardMap} onRemove={handleRemove} />
        </div>

        {/* 카드 풀 */}
        <CardPool cardTypes={cardTypes} placedCounts={placedCounts} maxPerCard={MAX_PER_CARD} />
      </div>
    </DndContext>
  );
}
