'use client';

import { parseISO } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import type {
  PlayerCalendarIntensity,
  PlayerCalendarRecurrence,
  PlayerCalendarRecurrenceConfig,
  PlayerSessionType,
} from '@/components/coach/players/types';
import { Toggle } from '@/components/ui/Toggle';
import { useAuth } from '@/lib/AuthContext';
import { withCoachCalendarMeta } from '@/lib/calendar/events';
import { useData } from '@/lib/DataContext';
import { supabase } from '@/lib/supabase';

interface IndividualEventCreatorProps {
  playerId: string;
  playerName: string;
  teamId: string;
  onSaved: () => void;
}

interface IndividualEventFormState {
  kind: 'event' | 'task';
  title: string;
  eventType: PlayerSessionType;
  description: string;
  date: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  recurrence: PlayerCalendarRecurrence;
  recurrenceDays: number[];
  recurrenceMonthDays: number[];
  recurrenceEndDate: string;
  anticipatedIntensity?: PlayerCalendarIntensity;
}

const defaultCoachEventTypes = [
  { id: 'training', name: 'Training', color: '#22c55e', isActivity: true },
  { id: 'game', name: 'Game', color: '#ff6b6b', isActivity: true },
  { id: 'gym', name: 'Gym', color: '#845ef7', isActivity: true },
  { id: 'recovery', name: 'Recovery', color: '#38bdf8', isActivity: true },
  { id: 'solo', name: 'Solo', color: '#ffd43b', isActivity: true },
  { id: 'meeting', name: 'Meeting', color: '#adb5bd', isActivity: false },
  { id: 'other', name: 'Other', color: '#adb5bd', isActivity: false },
] as const;
const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getTodayDateKey(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createDefaultForm(): IndividualEventFormState {
  const today = getTodayDateKey();

  return {
    kind: 'event',
    title: '',
    eventType: 'training',
    description: '',
    date: today,
    startDate: today,
    endDate: today,
    startTime: '09:00',
    endTime: '10:00',
    recurrence: 'none',
    recurrenceDays: [],
    recurrenceMonthDays: [],
    recurrenceEndDate: '',
    anticipatedIntensity: undefined,
  };
}

function normalizeTime(value: string): string {
  const [hourPart = '00', minutePart = '00'] = value.split(':');
  const hour = Number.parseInt(hourPart, 10);
  const minute = Number.parseInt(minutePart, 10);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return '00:00';
  }

  return `${String(Math.max(0, Math.min(23, hour))).padStart(2, '0')}:${String(Math.max(0, Math.min(59, minute))).padStart(2, '0')}`;
}

function isMissingCalendarDescriptionError(error: { message?: string | null; details?: string | null } | null | undefined): boolean {
  const message = `${error?.message ?? ''} ${error?.details ?? ''}`.toLowerCase();
  return message.includes('column calendar_events.description does not exist');
}

export function IndividualEventCreator({
  playerId,
  playerName,
  teamId,
  onSaved,
}: IndividualEventCreatorProps) {
  const { user } = useAuth();
  const { customEventTypes } = useData();
  const [form, setForm] = useState<IndividualEventFormState>(createDefaultForm);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const eventTypeOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color: string; isActivity: boolean }>(
      defaultCoachEventTypes.map((type) => [type.id, { ...type }])
    );
    customEventTypes.forEach((type) => {
      map.set(type.id, {
        id: type.id,
        name: type.name,
        color: type.color,
        isActivity: type.isActivity ?? false,
      });
    });
    return Array.from(map.values());
  }, [customEventTypes]);
  const activityTypes = useMemo(
    () => new Set(eventTypeOptions.filter((type) => type.isActivity).map((type) => type.id)),
    [eventTypeOptions]
  );

  useEffect(() => {
    setForm(createDefaultForm());
    setSaveError(null);
    setSaveSuccess(null);
  }, [playerId]);

  const handleToggleWeekDay = (day: number) => {
    setForm((previous) => ({
      ...previous,
      recurrenceDays: previous.recurrenceDays.includes(day)
        ? previous.recurrenceDays.filter((value) => value !== day)
        : [...previous.recurrenceDays, day],
    }));
  };

  const handleToggleMonthDay = (day: number) => {
    setForm((previous) => {
      if (previous.recurrenceMonthDays.includes(day)) {
        return { ...previous, recurrenceMonthDays: previous.recurrenceMonthDays.filter((value) => value !== day) };
      }

      if (previous.recurrenceMonthDays.length >= 4) {
        return previous;
      }

      return { ...previous, recurrenceMonthDays: [...previous.recurrenceMonthDays, day] };
    });
  };

  const saveEvent = async (publish: boolean) => {
    if (!user || !teamId || !playerId) {
      setSaveError('You must be signed in with a selected player.');
      return;
    }

    const title = form.title.trim();
    if (!title) {
      setSaveError('Event title is required.');
      return;
    }

    const isTask = form.kind === 'task';
    const startDate = isTask ? form.startDate : form.date;
    const endDate = isTask ? form.endDate : form.date;
    if (!startDate || !endDate) {
      setSaveError('Select valid dates.');
      return;
    }

    const parsedStartDate = parseISO(startDate);
    const parsedEndDate = parseISO(endDate);
    if (Number.isNaN(parsedStartDate.getTime()) || Number.isNaN(parsedEndDate.getTime())) {
      setSaveError('Select valid dates.');
      return;
    }
    if (parsedEndDate.getTime() < parsedStartDate.getTime()) {
      setSaveError('End date cannot be earlier than start date.');
      return;
    }

    if (form.recurrence === 'weekly' && form.recurrenceDays.length === 0) {
      setSaveError('Choose at least one weekday for weekly recurrence.');
      return;
    }

    if (form.recurrence === 'monthly' && form.recurrenceMonthDays.length === 0) {
      setSaveError('Choose at least one month day for monthly recurrence.');
      return;
    }

    const recurrenceConfig: PlayerCalendarRecurrenceConfig =
      form.recurrence === 'weekly'
        ? { days: [...form.recurrenceDays].sort((a, b) => a - b) }
        : form.recurrence === 'monthly'
          ? { monthDays: [...form.recurrenceMonthDays].sort((a, b) => a - b) }
          : {};
    const eventGroupId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const meta = {
      coachManaged: true,
      coachId: user.id,
      teamId,
      kind: form.kind,
      assignmentScope: 'player',
      assignedPlayerId: playerId,
      eventGroupId,
      published: publish,
    } as const;
    const row = {
      user_id: playerId,
      event_type_id: form.eventType,
      title,
      description: form.description.trim() || null,
      start_time: `${startDate}T${normalizeTime(form.startTime)}`,
      end_time: `${endDate}T${normalizeTime(form.endTime)}`,
      recurrence: form.recurrence,
      recurrence_config: withCoachCalendarMeta(recurrenceConfig, meta),
      recurrence_end_date: form.recurrence !== 'none' && form.recurrenceEndDate ? form.recurrenceEndDate : null,
      excluded_dates: [],
      overrides: {},
      anticipated_intensity:
        activityTypes.has(form.eventType) && form.anticipatedIntensity ? form.anticipatedIntensity : null,
    };

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    const { error: insertError } = await supabase.from('calendar_events').insert(row);
    if (insertError) {
      if (isMissingCalendarDescriptionError(insertError)) {
        const { description: _description, ...fallbackRow } = row;
        const fallbackInsert = await supabase.from('calendar_events').insert(fallbackRow);
        if (fallbackInsert.error) {
          setIsSaving(false);
          setSaveError(fallbackInsert.error.message || 'Unable to save this individual event.');
          return;
        }
      } else {
        setIsSaving(false);
        setSaveError(insertError.message || 'Unable to save this individual event.');
        return;
      }
    }

    setForm(createDefaultForm());
    setSaveSuccess(publish ? `Individual event published for ${playerName}.` : `Draft saved for ${playerName}.`);
    setIsSaving(false);
    onSaved();
  };

  return (
    <section className="glass-card flex min-h-0 flex-col p-4 sm:p-5 xl:self-start">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-white">Create Individual Event</h2>
        <p className="mt-1 text-xs text-gray-400">Selected player: {playerName}</p>
      </div>

      <div className="space-y-4">
        <Toggle
          label="Task mode"
          checked={form.kind === 'task'}
          onChange={(checked) => setForm((previous) => ({ ...previous, kind: checked ? 'task' : 'event' }))}
        />

        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400">
          Event Title
          <input
            type="text"
            value={form.title}
            onChange={(event) => setForm((previous) => ({ ...previous, title: event.target.value }))}
            placeholder="e.g. Individual Technical Session"
            className="mt-1.5 w-full rounded-xl border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.05)] p-3 text-sm text-white placeholder:text-gray-500"
          />
        </label>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Event Type</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {eventTypeOptions.map((type) => (
              <button
                key={type.id}
                type="button"
                onClick={() => setForm((previous) => ({ ...previous, eventType: type.id }))}
                className={`rounded-lg px-3 py-2 text-xs font-semibold capitalize transition-colors ${
                  form.eventType === type.id
                    ? 'text-black'
                    : 'border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.05)] text-gray-300 hover:text-white'
                }`}
                style={form.eventType === type.id ? { backgroundColor: type.color } : undefined}
              >
                {type.name}
              </button>
            ))}
          </div>
        </div>

        {activityTypes.has(form.eventType) ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Anticipated Intensity</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(['Low', 'Moderate', 'High'] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setForm((previous) => ({ ...previous, anticipatedIntensity: level }))}
                  className={`rounded-lg px-2 py-2 text-xs font-semibold transition-colors ${
                    form.anticipatedIntensity === level
                      ? 'bg-[var(--accent-primary)] text-black'
                      : 'border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.05)] text-gray-300 hover:text-white'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400">
          Description
          <textarea
            value={form.description}
            onChange={(event) => setForm((previous) => ({ ...previous, description: event.target.value }))}
            rows={3}
            placeholder="Session details, outcomes, and completion guidance."
            className="mt-1.5 w-full rounded-xl border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.05)] p-3 text-sm text-white placeholder:text-gray-500"
          />
        </label>

        {form.kind === 'task' ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Start Date
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(event) => setForm((previous) => ({ ...previous, startDate: event.target.value }))}
                  className="mt-1.5 w-full rounded-xl border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.05)] p-3 text-sm text-white [color-scheme:dark]"
                />
              </label>
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                End Date
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(event) => setForm((previous) => ({ ...previous, endDate: event.target.value }))}
                  className="mt-1.5 w-full rounded-xl border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.05)] p-3 text-sm text-white [color-scheme:dark]"
                />
              </label>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Start Time
                <input
                  type="time"
                  value={form.startTime}
                  onChange={(event) => setForm((previous) => ({ ...previous, startTime: event.target.value }))}
                  className="mt-1.5 w-full rounded-xl border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.05)] p-3 text-sm text-white"
                />
              </label>
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                End Time
                <input
                  type="time"
                  value={form.endTime}
                  onChange={(event) => setForm((previous) => ({ ...previous, endTime: event.target.value }))}
                  className="mt-1.5 w-full rounded-xl border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.05)] p-3 text-sm text-white"
                />
              </label>
            </div>
          </>
        ) : (
          <>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400">
              Date
              <input
                type="date"
                value={form.date}
                onChange={(event) => setForm((previous) => ({ ...previous, date: event.target.value }))}
                className="mt-1.5 w-full rounded-xl border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.05)] p-3 text-sm text-white [color-scheme:dark]"
              />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Start Time
                <input
                  type="time"
                  value={form.startTime}
                  onChange={(event) => setForm((previous) => ({ ...previous, startTime: event.target.value }))}
                  className="mt-1.5 w-full rounded-xl border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.05)] p-3 text-sm text-white"
                />
              </label>
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                End Time
                <input
                  type="time"
                  value={form.endTime}
                  onChange={(event) => setForm((previous) => ({ ...previous, endTime: event.target.value }))}
                  className="mt-1.5 w-full rounded-xl border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.05)] p-3 text-sm text-white"
                />
              </label>
            </div>
          </>
        )}

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Recurrence</p>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {(['none', 'daily', 'weekly', 'monthly'] as PlayerCalendarRecurrence[]).map((recurrence) => (
              <button
                key={recurrence}
                type="button"
                onClick={() => setForm((previous) => ({ ...previous, recurrence }))}
                className={`rounded-lg px-2 py-2 text-xs font-semibold capitalize transition-colors ${
                  form.recurrence === recurrence
                    ? 'bg-[var(--accent-secondary)] text-white'
                    : 'border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.05)] text-gray-300 hover:text-white'
                }`}
              >
                {recurrence === 'none' ? 'Once' : recurrence}
              </button>
            ))}
          </div>
        </div>

        {form.recurrence === 'weekly' ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Weekdays</p>
            <div className="mt-2 grid grid-cols-7 gap-1">
              {dayLabels.map((label, index) => {
                const day = index + 1;
                const isSelected = form.recurrenceDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => handleToggleWeekDay(day)}
                    className={`rounded-lg px-1 py-2 text-[11px] font-semibold transition-colors ${
                      isSelected
                        ? 'bg-[var(--accent-primary)] text-black'
                        : 'border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.05)] text-gray-300 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {form.recurrence === 'monthly' ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Month Days (max 4)</p>
            <div className="mt-2 grid grid-cols-7 gap-1">
              {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => {
                const isSelected = form.recurrenceMonthDays.includes(day);
                const isDisabled = !isSelected && form.recurrenceMonthDays.length >= 4;
                return (
                  <button
                    key={day}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => handleToggleMonthDay(day)}
                    className={`rounded-lg px-1 py-1.5 text-[10px] font-semibold transition-colors ${
                      isSelected
                        ? 'bg-[var(--accent-primary)] text-black'
                        : isDisabled
                          ? 'border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] text-gray-600'
                          : 'border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.05)] text-gray-300 hover:text-white'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {form.recurrence !== 'none' ? (
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400">
            Recurrence End Date (optional)
            <input
              type="date"
              value={form.recurrenceEndDate}
              min={form.kind === 'task' ? form.startDate : form.date}
              onChange={(event) => setForm((previous) => ({ ...previous, recurrenceEndDate: event.target.value }))}
              className="mt-1.5 w-full rounded-xl border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.05)] p-3 text-sm text-white [color-scheme:dark]"
            />
          </label>
        ) : null}

        {saveError ? (
          <p className="rounded-lg border border-[rgba(255,107,107,0.35)] bg-[rgba(255,107,107,0.12)] px-3 py-2 text-xs text-[var(--status-red)]">
            {saveError}
          </p>
        ) : null}
        {saveSuccess ? (
          <p className="rounded-lg border border-[rgba(var(--status-green-rgb),0.3)] bg-[rgba(var(--status-green-rgb),0.1)] px-3 py-2 text-xs text-[var(--status-green)]">
            {saveSuccess}
          </p>
        ) : null}

        <div className="space-y-2 border-t border-[rgba(255,255,255,0.08)] pt-4">
          <button
            type="button"
            disabled={isSaving}
            onClick={() => void saveEvent(false)}
            className="w-full rounded-xl border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.08)] py-3 text-sm font-semibold text-white transition-colors hover:bg-[rgba(255,255,255,0.12)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save as Draft
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => void saveEvent(true)}
            className="w-full rounded-xl bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-tertiary)] py-3 text-sm font-bold text-black transition-transform active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? 'Saving...' : 'Save and Publish'}
          </button>
        </div>
      </div>
    </section>
  );
}
