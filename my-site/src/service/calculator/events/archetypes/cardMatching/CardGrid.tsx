import { useDroppable } from '@dnd-kit/core';
import type { CardType } from '@/types/event';
import DraggableCard from './DraggableCard';

interface Props {
  /** 그리드 상태: 각 인덱스에 cardId 또는 null */
  gridState: (string | null)[];
  /** id → CardType 매핑 */
  cardMap: Map<string, CardType>;
  /** 카드 제거 */
  onRemove: (index: number) => void;
}

/** 12셀 그리드 — 드롭 대상 */
export default function CardGrid({ gridState, cardMap, onRemove }: Props) {
  return (
    <div className="grid grid-cols-6 gap-1.5 md:gap-3">
      {gridState.map((cardId, index) => (
        <GridCell
          key={index}
          index={index}
          cardId={cardId}
          card={cardId ? cardMap.get(cardId) : undefined}
          onRemove={() => onRemove(index)}
        />
      ))}
    </div>
  );
}

interface CellProps {
  index: number;
  cardId: string | null;
  card: CardType | undefined;
  onRemove: () => void;
}

function GridCell({ index, cardId, card, onRemove }: CellProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: `cell-${index}`,
    data: { cellIndex: index },
  });

  return (
    <div
      ref={setNodeRef}
      className={`aspect-square rounded-md border-2 transition-colors flex items-center justify-center relative ${
        isOver
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
          : cardId
            ? 'border-transparent'
            : 'border-dashed border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-800/50'
      }`}
    >
      {card ? (
        <>
          <DraggableCard
            draggableId={`grid:${index}`}
            card={card}
            payload={{ cardId: card.id, from: 'grid', gridIndex: index }}
          />
          {/* 제거 버튼 — 우측 상단 (터치 영역 확보) */}
          <button
            type="button"
            onClick={onRemove}
            aria-label="카드 제거"
            className="absolute -top-2 -right-2 w-7 h-7 flex items-center justify-center text-base leading-none font-bold bg-red-500 hover:bg-red-600 active:bg-red-700 text-white rounded-full shadow-md border-2 border-white dark:border-slate-800 z-20"
          >
            ×
          </button>
        </>
      ) : (
        <span className="text-xs text-gray-300 dark:text-slate-600">{index + 1}</span>
      )}
    </div>
  );
}
