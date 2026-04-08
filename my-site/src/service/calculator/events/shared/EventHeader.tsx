import { useEffect, useState } from 'react';
import type { EventConfig } from '@/types/event';
import { ARCHETYPE_REGISTRY } from '../archetypes';

interface Props {
  event: EventConfig;
}

/** 이벤트 헤더 — 이름, 아키타입 라벨, 종료까지 카운트다운 */
export default function EventHeader({ event }: Props) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000 * 60); // 1분마다 갱신
    return () => clearInterval(timer);
  }, []);

  const archetypeLabel = ARCHETYPE_REGISTRY[event.archetype]?.label ?? event.archetype;

  // 종료일까지 남은 시간 계산
  const end = new Date(event.endDate);
  end.setHours(23, 59, 59, 999);
  const msLeft = end.getTime() - now.getTime();
  const isEnded = msLeft < 0;

  let countdownText = '';
  if (isEnded) {
    countdownText = '이벤트 종료';
  } else {
    const days = Math.floor(msLeft / (1000 * 60 * 60 * 24));
    const hours = Math.floor((msLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    countdownText = `${days}일 ${hours}시간 남음`;
  }

  return (
    <div className="mb-6 pb-4 border-b border-gray-200 dark:border-slate-700">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-block px-2 py-0.5 text-xs font-medium bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded">
              {archetypeLabel}
            </span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-slate-100">
            {event.name}
          </h1>
          {event.description && (
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">{event.description}</p>
          )}
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
            {event.startDate} ~ {event.endDate}
          </p>
        </div>
        <div
          className={`shrink-0 text-sm font-semibold px-3 py-1 rounded ${
            isEnded
              ? 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400'
              : 'bg-yellow-50 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300'
          }`}
        >
          {countdownText}
        </div>
      </div>
    </div>
  );
}
