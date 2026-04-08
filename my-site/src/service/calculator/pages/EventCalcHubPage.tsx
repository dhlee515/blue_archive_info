import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { EventRepository } from '@/repositories/eventRepository';
import type { EventConfig } from '@/types/event';
import { ARCHETYPE_REGISTRY } from '../events/archetypes';
import EventCalcShell from '../events/shared/EventCalcShell';

export default function EventCalcHubPage() {
  const [active, setActive] = useState<EventConfig[]>([]);
  const [ended, setEnded] = useState<EventConfig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchEvents() {
      try {
        const [activeList, endedList] = await Promise.all([
          EventRepository.getActiveEvents(),
          EventRepository.getEndedEvents(),
        ]);
        setActive(activeList);
        setEnded(endedList);
      } finally {
        setLoading(false);
      }
    }
    fetchEvents();
  }, []);

  if (loading) {
    return (
      <EventCalcShell>
        <div className="text-center py-12 text-gray-400 dark:text-slate-400">
          데이터를 불러오는 중...
        </div>
      </EventCalcShell>
    );
  }

  return (
    <EventCalcShell>
      <h1 className="text-2xl md:text-3xl font-extrabold text-blue-900 dark:text-blue-300 mb-2 tracking-tight">
        이벤트 계산기
      </h1>
      <p className="text-sm text-gray-500 dark:text-slate-400 mb-6">
        진행 중이거나 종료된 이벤트의 목표 달성, 재화 교환을 계산할 수 있습니다.
      </p>

      {/* 진행 중 이벤트 */}
      <section className="mb-8">
        <h2 className="text-lg font-bold text-gray-800 dark:text-slate-200 mb-3">진행 중</h2>
        {active.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-slate-500">진행 중인 이벤트가 없습니다.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {active.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </section>

      {/* 종료된 이벤트 */}
      {ended.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-gray-500 dark:text-slate-400 mb-3">종료됨</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {ended.map((event) => (
              <EventCard key={event.id} event={event} ended />
            ))}
          </div>
        </section>
      )}
    </EventCalcShell>
  );
}

function EventCard({ event, ended }: { event: EventConfig; ended?: boolean }) {
  const archetypeLabel = ARCHETYPE_REGISTRY[event.archetype]?.label ?? event.archetype;
  return (
    <Link
      to={`/calculator/event/${event.id}`}
      className={`block bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-4 hover:shadow-md transition-shadow ${
        ended ? 'opacity-60 hover:opacity-100' : ''
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="inline-block px-2 py-0.5 text-xs font-medium bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded">
          {archetypeLabel}
        </span>
        {ended && (
          <span className="inline-block px-2 py-0.5 text-xs font-medium bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 rounded">
            종료
          </span>
        )}
      </div>
      <h3 className="font-bold text-gray-800 dark:text-slate-200 truncate">{event.name}</h3>
      <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
        {event.startDate} ~ {event.endDate}
      </p>
    </Link>
  );
}
