import { format, parseISO } from 'date-fns';
import type { TeamCalendarItem } from '@/components/coach/calendar/types';

interface CalendarEventCardProps {
  item: TeamCalendarItem;
}

function getItemColor(item: TeamCalendarItem) {
  if (item.type === 'training' || item.type === 'game' || item.type === 'cardio' || item.type === 'hiit' || item.type === 'gym') {
    return 'var(--accent-primary)';
  }
  return 'var(--accent-secondary)';
}

export function CalendarEventCard({ item }: CalendarEventCardProps) {
  const color = getItemColor(item);
  const statusBadgeClass =
    item.status === 'completed'
      ? 'border-[rgba(255,255,255,0.2)] bg-[rgba(255,255,255,0.08)] text-gray-300'
      : 'border-[rgba(var(--accent-primary-rgb),0.3)] bg-[rgba(var(--accent-primary-rgb),0.1)] text-[var(--accent-primary)]';

  return (
    <article
      className={`rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] p-3 ${
        item.status === 'completed' ? 'opacity-80' : ''
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <p className="truncate text-sm font-semibold text-white">{item.title}</p>
        </div>
        <span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase ${statusBadgeClass}`}>
          {item.status}
        </span>
      </div>

      <div className="space-y-1 text-xs text-gray-300">
        <p className="capitalize text-gray-400">
          {item.kind} • {item.type}
        </p>
        {item.kind === 'task' && item.startDate && item.endDate ? (
          <p>
            Window: {format(parseISO(item.startDate), 'MMM d')} {item.startTime} to {format(parseISO(item.endDate), 'MMM d')}{' '}
            {item.endTime}
          </p>
        ) : (
          <p>
            {format(parseISO(item.date), 'EEE, MMM d')} • {item.startTime} - {item.endTime}
          </p>
        )}
      </div>
    </article>
  );
}
