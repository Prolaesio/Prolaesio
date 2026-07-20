'use client';

import { parseISO } from 'date-fns';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Pencil, Plus, Trash2 } from 'lucide-react';
import type {
  PlayerCalendarIntensity,
  PlayerCalendarRecurrence,
  PlayerCalendarRecurrenceConfig,
  PlayerSessionType,
} from '@/components/coach/players/types';
import { Toggle } from '@/components/ui/Toggle';
import { useAuth } from '@/lib/AuthContext';
import {
  cleanupAttendanceForEventGroup,
  cleanupAttendanceForOccurrence,
  getCoachAttendanceTargetFromPlayerCalendarEvent,
} from '@/lib/calendar/attendance';
import { withCoachCalendarMeta } from '@/lib/calendar/events';
import { useData } from '@/lib/DataContext';
import { supabase } from '@/lib/supabase';
import type { PlayerCalendarEvent } from '@/components/coach/players/types';

interface IndividualEventCreatorProps {
  playerId: string;
  playerName: string;
  teamId: string;
  teamPlayerIds?: string[];
  editingEvent?: PlayerCalendarEvent | null;
  editingInstanceDate?: string | null;
  editingSourceEventIds?: string[];
  onCancelEdit?: () => void;
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
  { id: 'cardio', name: 'Cardio', color: '#38bdf8', isActivity: true },
  { id: 'hiit', name: 'HIIT', color: '#f97316', isActivity: true },
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

function formFromEvent(event: PlayerCalendarEvent): IndividualEventFormState {
  const isTask = event.kind === 'task';

  return {
    kind: event.kind ?? 'event',
    title: event.title,
    eventType: event.type,
    description: event.description ?? '',
    date: event.date,
    startDate: event.startDate ?? event.date,
    endDate: event.endDate ?? event.date,
    startTime: event.startTime,
    endTime: event.endTime,
    recurrence: event.recurrence ?? 'none',
    recurrenceDays: event.recurrenceConfig?.days ?? [],
    recurrenceMonthDays: event.recurrenceConfig?.monthDays ?? [],
    recurrenceEndDate: event.recurrenceEndDate ?? '',
    anticipatedIntensity: event.anticipatedIntensity ?? undefined,
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
  teamPlayerIds = [playerId],
  editingEvent,
  editingInstanceDate,
  editingSourceEventIds = [],
  onCancelEdit,
  onSaved,
}: IndividualEventCreatorProps) {
  const { user } = useAuth();
  const { customEventTypes, saveCustomEventType, deleteCustomEventType } = useData();
  const [form, setForm] = useState<IndividualEventFormState>(createDefaultForm);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [isCreatingNewType, setIsCreatingNewType] = useState(false);
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [actionTypeId, setActionTypeId] = useState<string | null>(null);
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeColor, setNewTypeColor] = useState('#845ef7');
  const [newTypeIsActivity, setNewTypeIsActivity] = useState(true);
  const typeTimerRef = useRef<number | null>(null);
  const typeLongPressTriggeredRef = useRef(false);
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
    setForm(editingEvent ? formFromEvent(editingEvent) : createDefaultForm());
    setSaveError(null);
    setSaveSuccess(null);
  }, [editingEvent, playerId]);

  useEffect(() => {
    return () => {
      if (typeTimerRef.current !== null) window.clearTimeout(typeTimerRef.current);
    };
  }, []);

  const clearTypeTimer = () => {
    if (typeTimerRef.current !== null) {
      window.clearTimeout(typeTimerRef.current);
      typeTimerRef.current = null;
    }
  };

  const startTypeTimer = (typeId: string) => {
    clearTypeTimer();
    typeLongPressTriggeredRef.current = false;
    typeTimerRef.current = window.setTimeout(() => {
      typeLongPressTriggeredRef.current = true;
      setActionTypeId(typeId);
    }, 600);
  };

  const handleTypeClick = (typeId: string) => {
    if (typeLongPressTriggeredRef.current) {
      typeLongPressTriggeredRef.current = false;
      return;
    }
    setForm((previous) => ({ ...previous, eventType: typeId }));
  };

  const resetTypeEditor = () => {
    setIsCreatingNewType(false);
    setEditingTypeId(null);
    setNewTypeName('');
    setNewTypeColor('#845ef7');
    setNewTypeIsActivity(true);
  };

  const startCreateType = () => {
    setActionTypeId(null);
    setEditingTypeId(null);
    setNewTypeName('');
    setNewTypeColor('#845ef7');
    setNewTypeIsActivity(true);
    setIsCreatingNewType(true);
  };

  const startEditType = (typeId: string) => {
    const type = eventTypeOptions.find((candidate) => candidate.id === typeId);
    if (!type) return;
    setActionTypeId(null);
    setEditingTypeId(type.id);
    setNewTypeName(type.name);
    setNewTypeColor(type.color);
    setNewTypeIsActivity(type.isActivity);
    setIsCreatingNewType(true);
  };

  const saveEventType = () => {
    const trimmedName = newTypeName.trim();
    if (!trimmedName) return;
    const id =
      editingTypeId ||
      (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `coach-type-${Date.now()}`);

    saveCustomEventType({
      id,
      name: trimmedName,
      color: newTypeColor,
      isBuiltIn: false,
      isActivity: newTypeIsActivity,
    });
    setForm((previous) => ({ ...previous, eventType: id }));
    resetTypeEditor();
  };

  const deleteEventType = (typeId: string) => {
    deleteCustomEventType(typeId);
    setActionTypeId(null);
    if (editingTypeId === typeId) resetTypeEditor();
    if (form.eventType === typeId) {
      setForm((previous) => ({ ...previous, eventType: eventTypeOptions.find((type) => type.id !== typeId)?.id ?? 'other' }));
    }
  };

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
    const eventGroupId = editingEvent?.sourceEventGroupId ||
      (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
    const assignmentScope = editingEvent?.assignmentScope ?? 'player';
    const published = editingEvent?.isDraft === true ? publish : publish;
    const meta = {
      coachManaged: true,
      coachId: user.id,
      teamId,
      kind: form.kind,
      assignmentScope,
      assignedPlayerId: assignmentScope === 'team' ? null : playerId,
      eventGroupId,
      published,
    } as const;
    const targetPlayerIds = assignmentScope === 'team' ? teamPlayerIds : [playerId];
    const rows = targetPlayerIds.map((targetPlayerId) => ({
      user_id: targetPlayerId,
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
    }));

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    const idsToReplace = editingSourceEventIds.length > 0 ? editingSourceEventIds : editingEvent ? [editingEvent.id] : [];
    if (idsToReplace.length > 0) {
      const { error: deleteError } = await supabase
        .from('calendar_events')
        .delete()
        .in('id', idsToReplace);
      if (deleteError) {
        setIsSaving(false);
        setSaveError(deleteError.message || 'Unable to update this event.');
        return;
      }
    }

    const { error: insertError } = await supabase.from('calendar_events').insert(rows);
    if (insertError) {
      if (isMissingCalendarDescriptionError(insertError)) {
        const fallbackRows = rows.map(({ description: _description, ...row }) => row);
        const fallbackInsert = await supabase.from('calendar_events').insert(fallbackRows);
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
    setSaveSuccess(editingEvent ? 'Event updated.' : publish ? `Individual event published for ${playerName}.` : `Draft saved for ${playerName}.`);
    setIsSaving(false);
    onCancelEdit?.();
    onSaved();
  };

  const deleteEvent = async () => {
    if (!editingEvent) {
      setSaveError('No saved event is selected.');
      return;
    }

    const idsToDelete = editingSourceEventIds.length > 0 ? editingSourceEventIds : [editingEvent.id];
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    const attendanceTarget = getCoachAttendanceTargetFromPlayerCalendarEvent(editingEvent, editingEvent.date);
    if (attendanceTarget) {
      const cleanup = await cleanupAttendanceForEventGroup({
        target: attendanceTarget,
        playerId: editingEvent.assignmentScope === 'player' ? playerId : null,
      });
      if (cleanup.error) {
        setIsSaving(false);
        setSaveError(cleanup.error);
        return;
      }
    }

    const { error: deleteError } = await supabase
      .from('calendar_events')
      .delete()
      .in('id', idsToDelete);

    setIsSaving(false);
    if (deleteError) {
      setSaveError(deleteError.message || 'Unable to delete this event.');
      return;
    }

    setForm(createDefaultForm());
    setSaveSuccess('Event deleted.');
    onCancelEdit?.();
    onSaved();
  };

  const deleteOccurrence = async () => {
    if (!editingEvent || !editingInstanceDate) {
      setSaveError('No occurrence is selected.');
      return;
    }

    const idsToUpdate = editingSourceEventIds.length > 0 ? editingSourceEventIds : [editingEvent.id];
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    const attendanceTarget = getCoachAttendanceTargetFromPlayerCalendarEvent(editingEvent, editingInstanceDate);
    if (attendanceTarget) {
      const cleanup = await cleanupAttendanceForOccurrence({
        target: attendanceTarget,
        playerId: editingEvent.assignmentScope === 'player' ? playerId : null,
      });
      if (cleanup.error) {
        setIsSaving(false);
        setSaveError(cleanup.error);
        return;
      }
    }

    const nextExcludedDates = Array.from(new Set([...(editingEvent.excludedDates ?? []), editingInstanceDate]));
    const { error: updateError } = await supabase
      .from('calendar_events')
      .update({ excluded_dates: nextExcludedDates })
      .in('id', idsToUpdate);

    setIsSaving(false);
    if (updateError) {
      setSaveError(updateError.message || 'Unable to delete this occurrence.');
      return;
    }

    setForm(createDefaultForm());
    setSaveSuccess('Occurrence deleted.');
    onCancelEdit?.();
    onSaved();
  };

  return (
    <section className="glass-card flex min-h-0 flex-col p-4 sm:p-5 xl:self-start">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">{editingEvent ? 'Edit Calendar Event' : 'Create Individual Event'}</h2>
          <p className="mt-1 text-xs text-gray-400">
            {editingEvent?.assignmentScope === 'team' ? 'Team event' : `Selected player: ${playerName}`}
          </p>
        </div>
        {editingEvent ? (
          <button
            type="button"
            onClick={onCancelEdit}
            className="rounded-lg border border-[rgba(255,255,255,0.14)] px-2.5 py-1.5 text-[11px] font-semibold text-gray-300 transition-colors hover:text-white"
          >
            Cancel Edit
          </button>
        ) : null}
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
          {!isCreatingNewType ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {eventTypeOptions.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => handleTypeClick(type.id)}
                  onPointerDown={() => startTypeTimer(type.id)}
                  onPointerUp={clearTypeTimer}
                  onPointerLeave={clearTypeTimer}
                  onPointerCancel={clearTypeTimer}
                  onContextMenu={(event) => event.preventDefault()}
                  className={`rounded-lg px-3 py-2 text-xs font-bold transition-all border ${
                    form.eventType === type.id
                      ? 'border-transparent text-black'
                      : 'border-[rgba(255,255,255,0.1)] text-gray-300'
                  }`}
                  style={form.eventType === type.id ? { backgroundColor: type.color } : undefined}
                >
                  {type.name}
                </button>
              ))}
              <button
                type="button"
                onClick={startCreateType}
                className="px-3 py-2 rounded-lg text-xs font-bold transition-all border border-dashed border-[rgba(255,255,255,0.3)] text-gray-300 flex items-center"
              >
                <Plus size={14} className="mr-1" /> New
              </button>
            </div>
          ) : (
            <div className="mt-2 p-3 bg-[rgba(255,255,255,0.05)] rounded-xl border border-[var(--accent-secondary)] animate-fade-in">
              <input
                type="text"
                value={newTypeName}
                onChange={(event) => setNewTypeName(event.target.value)}
                placeholder="Custom Type Name"
                className="w-full bg-transparent border-b border-[rgba(255,255,255,0.1)] pb-2 mb-3 text-white text-sm focus:outline-none"
              />

              <div className="flex items-center justify-between mb-3">
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-gray-200">Activity Event</span>
                  <span className="text-[10px] text-gray-500">Adds an anticipated intensity</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={newTypeIsActivity}
                  onClick={() => setNewTypeIsActivity((value) => !value)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                    newTypeIsActivity ? 'bg-[var(--accent-primary)]' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      newTypeIsActivity ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center space-x-3">
                <span className="text-xs text-gray-400">Color:</span>
                <input
                  type="color"
                  value={newTypeColor}
                  onChange={(event) => setNewTypeColor(event.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border-0 p-0 bg-transparent"
                />
                <div className="flex-1"></div>
                <button
                  type="button"
                  onClick={saveEventType}
                  disabled={!newTypeName.trim()}
                  className="text-xs font-bold text-black bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg flex items-center transition-colors"
                >
                  <Check size={12} className="mr-1" /> Save Type
                </button>
                <button
                  type="button"
                  onClick={resetTypeEditor}
                  className="text-xs text-gray-400 hover:text-white px-2 py-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {actionTypeId ? (
            <div className="mt-3 p-3 rounded-xl bg-[rgba(255,107,107,0.1)] border border-[rgba(255,107,107,0.3)] animate-fade-in">
              <p className="text-xs text-gray-200 mb-3">
                Manage <span className="font-bold text-white">&ldquo;{eventTypeOptions.find((type) => type.id === actionTypeId)?.name}&rdquo;</span>
              </p>
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => startEditType(actionTypeId)}
                  className="flex-1 py-2 rounded-lg text-xs font-bold bg-[rgba(255,255,255,0.08)] text-white flex items-center justify-center transition-transform active:scale-95"
                >
                  <Pencil size={14} className="mr-1.5" /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => deleteEventType(actionTypeId)}
                  className="flex-1 py-2 rounded-lg text-xs font-bold bg-[#ff6b6b] text-white flex items-center justify-center transition-transform active:scale-95"
                >
                  <Trash2 size={14} className="mr-1.5" /> Delete
                </button>
                <button
                  type="button"
                  onClick={() => setActionTypeId(null)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-gray-400 bg-[rgba(255,255,255,0.05)] hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
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
            {isSaving ? 'Saving...' : editingEvent ? 'Update and Publish' : 'Save and Publish'}
          </button>
          {editingEvent ? (
            <>
              {editingEvent.recurrence && editingEvent.recurrence !== 'none' && editingInstanceDate ? (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => void deleteOccurrence()}
                  className="w-full rounded-xl border border-[rgba(255,146,43,0.34)] bg-[rgba(255,146,43,0.1)] py-3 text-sm font-semibold text-[var(--status-orange)] transition-colors hover:bg-[rgba(255,146,43,0.14)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Delete This Occurrence
                </button>
              ) : null}
            <button
              type="button"
              disabled={isSaving}
              onClick={() => void deleteEvent()}
              className="w-full rounded-xl border border-[rgba(255,107,107,0.32)] bg-[rgba(255,107,107,0.1)] py-3 text-sm font-semibold text-[#ff6b6b] transition-colors hover:bg-[rgba(255,107,107,0.14)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {editingEvent.recurrence && editingEvent.recurrence !== 'none' ? 'Delete Series' : 'Delete Event'}
            </button>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
