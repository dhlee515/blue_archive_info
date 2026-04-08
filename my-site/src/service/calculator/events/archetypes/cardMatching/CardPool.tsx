import type { CardType } from '@/types/event';
import DraggableCard from './DraggableCard';
import { RARITY_STYLES } from './cardStyles';

interface Props {
  cardTypes: CardType[];
  /** 카드 ID → 그리드에 이미 배치된 개수 */
  placedCounts: Map<string, number>;
  /** 카드 한 종류당 최대 배치 가능 수 (보통 2) */
  maxPerCard?: number;
}

/** 드래그 소스 — 출현 가능한 카드 종류를 나열. 2장 모두 배치되면 비활성화 */
export default function CardPool({ cardTypes, placedCounts, maxPerCard = 2 }: Props) {
  return (
    <div>
      <h3 className="text-sm font-bold text-gray-700 dark:text-slate-300 mb-2">카드 풀</h3>
      <p className="text-xs text-gray-500 dark:text-slate-400 mb-2">
        카드를 위 그리드의 빈 칸으로 드래그하세요. 카드는 최대 {maxPerCard}장까지 배치할 수 있습니다.
      </p>
      <div className="grid grid-cols-6 gap-1.5 md:gap-2">
        {cardTypes.map((card) => {
          const count = placedCounts.get(card.id) ?? 0;
          const remaining = maxPerCard - count;
          const exhausted = remaining <= 0;
          return (
            <div key={card.id} className="aspect-square relative">
              {exhausted ? (
                <div
                  className={`w-full h-full flex items-center justify-center text-xs md:text-sm font-bold border-2 rounded-md ${RARITY_STYLES[card.rarity]} opacity-30 cursor-not-allowed`}
                >
                  {card.name}
                </div>
              ) : (
                <DraggableCard
                  draggableId={`pool:${card.id}`}
                  card={card}
                  payload={{ cardId: card.id, from: 'pool' }}
                />
              )}
              {/* 남은 수량 뱃지 */}
              <span
                className={`absolute -top-1.5 -right-1.5 min-w-6 h-6 px-1.5 flex items-center justify-center text-xs font-bold rounded-full shadow border-2 border-white dark:border-slate-800 ${
                  exhausted
                    ? 'bg-gray-300 dark:bg-slate-600 text-gray-600 dark:text-slate-300'
                    : 'bg-blue-500 text-white'
                }`}
              >
                {remaining}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
