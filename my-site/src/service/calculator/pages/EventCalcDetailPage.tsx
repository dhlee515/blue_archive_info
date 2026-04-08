import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { EventRepository } from '@/repositories/eventRepository';
import type { EventConfig } from '@/types/event';
import { ARCHETYPE_REGISTRY } from '../events/archetypes';
import EventCalcShell from '../events/shared/EventCalcShell';
import EventHeader from '../events/shared/EventHeader';

export default function EventCalcDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [event, setEvent] = useState<EventConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchEvent() {
      if (!eventId) {
        setLoading(false);
        return;
      }
      try {
        const result = await EventRepository.getEventById(eventId);
        setEvent(result);
      } finally {
        setLoading(false);
      }
    }
    fetchEvent();
  }, [eventId]);

  if (loading) {
    return (
      <EventCalcShell>
        <div className="text-center py-12 text-gray-400 dark:text-slate-400">
          데이터를 불러오는 중...
        </div>
      </EventCalcShell>
    );
  }

  if (!event) {
    return (
      <EventCalcShell>
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-slate-400 mb-4">존재하지 않는 이벤트입니다.</p>
          <Link
            to="/calculator/event"
            className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
          >
            ← 이벤트 목록으로 돌아가기
          </Link>
        </div>
      </EventCalcShell>
    );
  }

  const archetype = ARCHETYPE_REGISTRY[event.archetype];
  if (!archetype) {
    return (
      <EventCalcShell>
        <div className="text-center py-12 text-red-500">
          알 수 없는 이벤트 타입: {event.archetype}
        </div>
      </EventCalcShell>
    );
  }

  const { Form } = archetype;

  return (
    <EventCalcShell>
      <Link
        to="/calculator/event"
        className="inline-block mb-3 text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 transition-colors"
      >
        ← 이벤트 목록
      </Link>
      <EventHeader event={event} />
      <Form config={event} />
    </EventCalcShell>
  );
}
