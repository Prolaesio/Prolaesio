'use client';

import React from 'react';
import Link from 'next/link';
import { format, isTomorrow } from 'date-fns';
import {
  BatteryMedium,
  Bell,
  Brain,
  Calendar as CalendarIcon,
  ChevronRight,
  CirclePlus,
  Dumbbell,
  Moon,
  ShieldAlert,
  X,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PlayerRsvpControl } from '@/components/calendar/PlayerRsvpControl';
import { ReadinessGauge } from '@/components/ReadinessGauge';
import { useAuth } from '@/lib/AuthContext';
import {
  getPlayerRsvpTargetFromCalendarEvent,
} from '@/lib/calendar/attendance';
import { parseCoachCalendarMeta } from '@/lib/calendar/events';
import { getCalendarOccurrencesInWindow } from '@/lib/calendar/occurrences';
import { useData } from '@/lib/DataContext';
import { buildPlayerReminders } from '@/lib/player-reminders';
import type { PlayerReminder } from '@/lib/player-reminders';
import { useTrainingLoad } from '@/hooks/useTrainingLoad';
import { useReadiness } from '@/hooks/useReadiness';
import { usePersistedState } from '@/lib/usePersistedState';

const HOME_NOTIFICATION_DISMISSALS_KEY = 'lodario:home-notification-dismissals';
const EMPTY_NOTIFICATION_DISMISSALS: string[] = [];

type HomeCalendarOccurrence = ReturnType<typeof getCalendarOccurrencesInWindow>[number];

interface HomeNotificationBase {
  id: string;
  color: string;
  dismissible: boolean;
}

interface HomeEventNotificationItem extends HomeNotificationBase {
  kind: 'event';
  occurrence: HomeCalendarOccurrence;
  isCoachManaged: boolean;
  rsvpTarget: ReturnType<typeof getPlayerRsvpTargetFromCalendarEvent>;
}

interface HomeReminderNotificationItem extends HomeNotificationBase {
  kind: 'reminder';
  reminder: PlayerReminder;
}

type HomeNotificationItem = HomeEventNotificationItem | HomeReminderNotificationItem;

interface ReadinessMetricCardProps {
  label: string;
  score: number;
  colorScore?: number;
  Icon: LucideIcon;
}

function normalizeNotificationDismissals(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

function getNotificationId(occurrence: HomeCalendarOccurrence): string {
  return [
    occurrence.key,
    occurrence.title,
    occurrence.start.toISOString(),
    occurrence.end.toISOString(),
    occurrence.eventTypeId,
  ].join('|');
}

function interpolateColor(start: [number, number, number], end: [number, number, number], progress: number): string {
  const channel = (index: number) => Math.round(start[index] + (end[index] - start[index]) * progress);
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
}

function getScoreStatusColor(score: number): string {
  const normalizedScore = Math.max(0, Math.min(100, score));
  const red: [number, number, number] = [255, 61, 61];
  const yellow: [number, number, number] = [255, 181, 31];
  const green: [number, number, number] = [32, 240, 107];

  if (normalizedScore <= 30) {
    return interpolateColor(red, red, 0);
  }

  if (normalizedScore <= 65) {
    return interpolateColor(red, yellow, (normalizedScore - 30) / 35);
  }

  return interpolateColor(yellow, green, (normalizedScore - 65) / 35);
}

function ReadinessMetricCard({ label, score, colorScore = score, Icon }: ReadinessMetricCardProps) {
  const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));
  const normalizedColorScore = Math.max(0, Math.min(100, Math.round(colorScore)));
  const color = getScoreStatusColor(normalizedColorScore);

  return (
    <div
      className="relative h-[52px] overflow-hidden rounded-lg border bg-[rgba(17,17,16,0.9)] px-2.5 py-2 shadow-[0_10px_24px_rgba(0,0,0,0.34)] backdrop-blur-md"
      style={{
        borderColor: color,
      }}
    >
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/25 text-white">
          <Icon size={15} strokeWidth={2.4} />
        </div>
        <p className="min-w-0 truncate text-[8px] font-black uppercase leading-none tracking-normal text-white/95">{label}</p>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.09]">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{
              width: `${normalizedScore}%`,
              background: color,
            }}
          />
        </div>
        <span className="min-w-5 text-right text-[11px] font-black leading-none text-white">{normalizedScore}</span>
      </div>
    </div>
  );
}

function DismissibleNotificationCard({
  item,
  onDismiss,
}: {
  item: HomeNotificationItem;
  onDismiss: (id: string) => void;
}) {
  const [dragX, setDragX] = React.useState(0);
  const [isDragging, setIsDragging] = React.useState(false);
  const dragXRef = React.useRef(0);
  const startXRef = React.useRef(0);
  const pointerIdRef = React.useRef<number | null>(null);

  const setDragPosition = React.useCallback((nextDragX: number) => {
    dragXRef.current = nextDragX;
    setDragX(nextDragX);
  }, []);

  const dismiss = React.useCallback(() => {
    if (!item.dismissible) return;
    onDismiss(item.id);
  }, [item.dismissible, item.id, onDismiss]);

  const handlePointerDown = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!item.dismissible) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    pointerIdRef.current = event.pointerId;
    startXRef.current = event.clientX - dragXRef.current;
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [item.dismissible]);

  const handlePointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (pointerIdRef.current !== event.pointerId) return;

      const nextDragX = Math.max(-140, Math.min(140, event.clientX - startXRef.current));
      setDragPosition(nextDragX);
    },
    [setDragPosition]
  );

  const finishDrag = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (pointerIdRef.current !== event.pointerId) return;

      const shouldDismiss = item.dismissible && Math.abs(dragXRef.current) > 88;
      pointerIdRef.current = null;
      setIsDragging(false);

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      if (shouldDismiss) {
        dismiss();
      } else {
        setDragPosition(0);
      }
    },
    [dismiss, item.dismissible, setDragPosition]
  );

  const handlePointerCancel = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (pointerIdRef.current !== event.pointerId) return;

      pointerIdRef.current = null;
      setIsDragging(false);
      setDragPosition(0);
    },
    [setDragPosition]
  );

  const opacity = Math.max(0.35, 1 - Math.abs(dragX) / 180);
  const isReminder = item.kind === 'reminder';

  return (
    <div
      className="glass-card relative border-l-4 p-4 pr-8 pt-5 touch-target"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={handlePointerCancel}
      style={{
        borderLeftColor: item.color,
        opacity,
        touchAction: 'pan-y',
        transform: `translateX(${dragX}px)`,
        transition: isDragging ? 'none' : 'transform 180ms ease, opacity 180ms ease',
      }}
    >
      {item.dismissible ? (
        <button
          type="button"
          aria-label="Dismiss notification"
          className="absolute right-2 top-2 rounded-full p-1 text-white/80 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/40"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            dismiss();
          }}
        >
          <X size={14} strokeWidth={1.5} />
        </button>
      ) : null}

      {isReminder ? (
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[rgba(var(--accent-primary-rgb),0.14)] text-[var(--accent-primary)]">
            <Bell size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold leading-snug text-white">{item.reminder.title}</p>
            {item.reminder.description ? (
              <p className="mt-1 text-xs leading-relaxed text-gray-400">{item.reminder.description}</p>
            ) : null}
            {item.reminder.action ? (
              <Link
                href={item.reminder.action.href}
                className="mt-2 inline-flex items-center text-xs font-bold text-[var(--accent-primary)] hover:underline"
                onPointerDown={(event) => event.stopPropagation()}
              >
                {item.reminder.action.label}
                <ChevronRight size={14} className="ml-0.5" />
              </Link>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {item.isCoachManaged ? (
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--accent-secondary)]">
                Coach update
              </p>
            ) : null}
            <h4 className="truncate text-sm font-bold text-white mb-0.5">{item.occurrence.title}</h4>
            <p className="text-xs text-gray-400">
              {isTomorrow(item.occurrence.start) ? 'Tomorrow, ' : ''}
              {format(item.occurrence.start, 'EEE, MMM d')} - {format(item.occurrence.start, 'h:mm a')} to{' '}
              {format(item.occurrence.end, 'h:mm a')}
            </p>
          </div>
          {item.rsvpTarget ? (
            <div onPointerDown={(event) => event.stopPropagation()}>
              <PlayerRsvpControl target={item.rsvpTarget} compact />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  const { readiness } = useReadiness();
  const { calendarEvents, customEventTypes, injuries, trainingLogs, wellnessLogs } = useData();
  const [now, setNow] = React.useState(() => new Date());
  const [storedDismissedNotificationIds, setStoredDismissedNotificationIds] = usePersistedState<string[]>(
    HOME_NOTIFICATION_DISMISSALS_KEY,
    EMPTY_NOTIFICATION_DISMISSALS,
    { storage: 'local' }
  );
  const load = useTrainingLoad();

  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const activeInjuries = injuries.filter((injury) => injury.status === 'active');
  const showInjuryAlert = activeInjuries.length > 0 || load.hasAutoInjury;
  const todayKey = format(now, 'yyyy-MM-dd');
  const todayWellness = wellnessLogs[todayKey];
  const painScore = todayWellness?.painActive ? (todayWellness.painLevel ?? 0) * 10 : 0;
  const windowEnd = React.useMemo(() => new Date(now.getTime() + 24 * 60 * 60 * 1000), [now]);
  const leftReadinessMetrics = [
    { label: 'Sleep', score: readiness.breakdown.sleep, Icon: Moon },
    { label: 'Energy', score: readiness.breakdown.energy, Icon: Zap },
    { label: 'Stress', score: readiness.breakdown.stress, Icon: Brain },
  ];
  const rightReadinessMetrics = [
    { label: 'Fatigue', score: readiness.breakdown.fatigue, Icon: BatteryMedium },
    { label: 'Load', score: readiness.breakdown.load, Icon: Dumbbell },
    { label: 'Pain', score: painScore, colorScore: 100 - painScore, Icon: CirclePlus },
  ];

  const scheduleOccurrences = React.useMemo(() => {
    return getCalendarOccurrencesInWindow(calendarEvents, now, windowEnd)
      .filter((occurrence) => occurrence.end.getTime() > now.getTime())
      .slice(0, 12);
  }, [calendarEvents, now, windowEnd]);

  const eventTypeColorById = React.useMemo(() => {
    return new Map(customEventTypes.map((type) => [type.id, type.color]));
  }, [customEventTypes]);

  const dismissedNotificationIds = React.useMemo(() => {
    return new Set(normalizeNotificationDismissals(storedDismissedNotificationIds));
  }, [storedDismissedNotificationIds]);

  const notificationItems = React.useMemo<HomeNotificationItem[]>(() => {
    const reminderItems: HomeReminderNotificationItem[] = buildPlayerReminders({
      calendarEvents,
      customEventTypes,
      dismissedReminderIds: dismissedNotificationIds,
      now,
      trainingLogs,
      wellnessLogs,
    })
      .filter((reminder) => reminder.type !== 'coach-added-event')
      .map((reminder) => ({
        id: reminder.id,
        kind: 'reminder',
        reminder,
        color: 'var(--accent-primary)',
        dismissible: reminder.dismissible,
      }));

    const visibleReminderSourceEventIds = new Set(
      reminderItems
        .map((item) => item.reminder.sourceEventId)
        .filter((eventId): eventId is string => typeof eventId === 'string')
    );

    const eventItems: HomeEventNotificationItem[] = scheduleOccurrences
      .map((occurrence) => {
        const coachMeta = parseCoachCalendarMeta(occurrence.event.recurrenceConfig);
        const color =
          occurrence.event.color ||
          eventTypeColorById.get(occurrence.eventTypeId) ||
          'var(--accent-primary)';

        return {
          id: getNotificationId(occurrence),
          kind: 'event' as const,
          occurrence,
          color,
          dismissible: true,
          isCoachManaged: coachMeta?.coachManaged === true,
          rsvpTarget: getPlayerRsvpTargetFromCalendarEvent(occurrence.event, occurrence.instanceDate, user?.id),
        };
      })
      .filter((item) => !dismissedNotificationIds.has(item.id) && !visibleReminderSourceEventIds.has(item.occurrence.event.id));

    return [...reminderItems, ...eventItems].slice(0, 12);
  }, [
    calendarEvents,
    customEventTypes,
    dismissedNotificationIds,
    eventTypeColorById,
    now,
    scheduleOccurrences,
    trainingLogs,
    user?.id,
    wellnessLogs,
  ]);

  const dismissNotification = React.useCallback(
    (notificationId: string) => {
      const dismissedNotification = notificationItems.find((item) => item.id === notificationId);
      const relatedEventIds =
        dismissedNotification?.kind === 'reminder' && dismissedNotification.reminder.sourceEventId
          ? new Set([dismissedNotification.reminder.sourceEventId])
          : new Set<string>();
      const relatedNotificationIds = notificationItems
        .filter((item) => item.kind === 'event' && relatedEventIds.has(item.occurrence.event.id))
        .map((item) => item.id);
      const nextNotificationIds = [notificationId, ...relatedNotificationIds];

      setStoredDismissedNotificationIds((currentValue) => {
        const currentIds = normalizeNotificationDismissals(currentValue);
        const nextIds = nextNotificationIds.filter((id) => !currentIds.includes(id));
        if (nextIds.length === 0) return currentIds;
        return [...currentIds, ...nextIds];
      });
    },
    [notificationItems, setStoredDismissedNotificationIds]
  );

  return (
    <div className="relative mx-auto max-w-md px-2.5 py-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[360px] bg-[linear-gradient(180deg,rgba(34,197,94,0.07),rgba(255,146,43,0.045)_48%,transparent)]" />

      <header className="relative mb-6 pl-1.5">
        <h1 className="text-4xl font-black tracking-normal text-white">Prolaesio</h1>
        <p className="mt-1 text-base font-semibold text-[var(--accent-secondary)]">Your personal training guide</p>
      </header>

      {showInjuryAlert ? (
        <div className="relative mb-6 flex items-start space-x-3 rounded-lg border border-[#ff6b6b] bg-[rgba(255,107,107,0.09)] p-4 shadow-[0_12px_28px_rgba(0,0,0,0.3)] backdrop-blur-md animate-slide-up touch-target">
          <ShieldAlert className="text-[#ff6b6b] mt-0.5" size={24} />
          <div>
            <h3 className="text-[#ff6b6b] font-bold text-sm tracking-wide">Active Protocol</h3>
            <p className="text-gray-300 text-xs mt-1 leading-relaxed">
              {load.hasAutoInjury
                ? 'Pain or injury has triggered an active recovery protocol.'
                : 'Active injury logged. Follow your prescribed recovery plan.'}
            </p>
          </div>
        </div>
      ) : null}

      <section className="relative mb-6 animate-fade-in" style={{ animationDelay: '0.2s', animationFillMode: 'both' }}>
        <div className="mb-2 flex items-center justify-center gap-3 px-1.5">
          <div className="h-px flex-1 bg-[linear-gradient(90deg,transparent,rgba(255,146,43,0.85))]" />
          <h2 className="shrink-0 text-sm font-black tracking-normal text-white">Daily Readiness</h2>
          <div className="h-px flex-1 bg-[linear-gradient(90deg,rgba(255,146,43,0.85),transparent)]" />
        </div>
        <div className="grid grid-cols-[136px_112px_136px] justify-center items-center gap-3">
          <div className="grid gap-2">
            {leftReadinessMetrics.map((item) => (
              <ReadinessMetricCard key={item.label} {...item} />
            ))}
          </div>
          <div className="flex justify-center">
            <ReadinessGauge score={readiness.score} color={readiness.color} label={readiness.label} />
          </div>
          <div className="grid gap-2">
            {rightReadinessMetrics.map((item) => (
              <ReadinessMetricCard key={item.label} {...item} />
            ))}
          </div>
        </div>
      </section>

      <section className="relative mb-12 animate-slide-up" style={{ animationDelay: '0.3s', animationFillMode: 'both' }}>
        <div className="flex justify-between items-end mb-4 pl-1">
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider font-sans">Notifications</h2>
          </div>
          <Link href="/calendar" className="text-xs text-[var(--accent-secondary)] font-medium hover:text-[var(--accent-primary)]">
            View All
          </Link>
        </div>

        {notificationItems.length === 0 ? (
          <div className="glass-card p-6 flex flex-col items-center justify-center text-gray-400 border-dashed border-[rgba(255,255,255,0.2)]">
            <CalendarIcon size={32} className="mb-2 opacity-50" />
            <p className="text-sm">No notifications right now</p>
            <p className="mt-1 text-center text-xs text-gray-500">
              Coach updates and upcoming items you should know about will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {notificationItems.map((item) => (
              <DismissibleNotificationCard key={item.id} item={item} onDismiss={dismissNotification} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
