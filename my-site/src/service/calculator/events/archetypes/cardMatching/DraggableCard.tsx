import { useDraggable } from '@dnd-kit/core';
import type { CardType } from '@/types/event';
import { RARITY_STYLES } from './cardStyles';

interface Props {
  /** 드래그 ID — 풀에서는 'pool:cardId', 그리드에서는 'grid:index' */
  draggableId: string;
  card: CardType;
  /** 드래그 페이로드 (드롭 시 어떤 카드를 드롭할지 식별) */
  payload: { cardId: string; from: 'pool' | 'grid'; gridIndex?: number };
}

/** 드래그 가능한 카드 칩 */
export default function DraggableCard({ draggableId, card, payload }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: draggableId,
    data: payload,
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 50,
      }
    : undefined;

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      type="button"
      style={style}
      className={`select-none touch-none w-full h-full flex items-center justify-center text-xs md:text-sm font-bold border-2 rounded-md cursor-grab active:cursor-grabbing transition-shadow ${
        RARITY_STYLES[card.rarity]
      } ${isDragging ? 'shadow-lg opacity-80' : 'shadow-sm'}`}
    >
      {card.name}
    </button>
  );
}
