'use client';

import React, { useState, useRef, useEffect } from 'react';
import { CalendarEvent, RecurrenceType } from '../lib/types';
import { useData } from '../lib/DataContext';
import { X, Save, Plus, Trash2, Check, FileText, ChevronDown, Lock, Pencil, Palette } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { PlayerRsvpControl } from '@/components/calendar/PlayerRsvpControl';
import { useAuth } from '@/lib/AuthContext';
import { getPlayerRsvpTargetFromCalendarEvent } from '@/lib/calendar/attendance';
import { parseCoachCalendarMeta } from '../lib/calendar/events';

interface EventModalProps {
  onClose: () => void;
  selectedDate: string; // YYYY-MM-DD
  existingEvent?: CalendarEvent; // if editing
  isRecurringInstance?: boolean; // true when clicking a generated recurring occurrence
  instanceDate?: string; // the specific date of this occurrence (YYYY-MM-DD)
  defaultStartHour?: number; // Feature 5: clicked hour slot
  readOnly?: boolean;
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function EventModal({ onClose, selectedDate, existingEvent, isRecurringInstance, instanceDate, defaultStartHour, readOnly = false }: EventModalProps) {
  const { customEventTypes, saveCalendarEvent, deleteCalendarEvent, saveCalendarEventColorOverride, saveCustomEventType, deleteCustomEventType } = useData();
  const { user } = useAuth();

  // --- Event type long-press-to-delete ---
  const [deleteTypeId, setDeleteTypeId] = useState<string | null>(null);
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const typeTimerRef = useRef<number | null>(null);
  const typeLongPressTriggeredRef = useRef(false);

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
      setDeleteTypeId(typeId);
    }, 600);
  };

  const handleTypeClick = (typeId: string) => {
    if (typeLongPressTriggeredRef.current) {
      typeLongPressTriggeredRef.current = false;
      return;
    }
    setEventTypeId(typeId);
  };

  const handleDeleteType = (typeId: string) => {
    deleteCustomEventType(typeId);
    setDeleteTypeId(null);
    if (editingTypeId === typeId) {
      setEditingTypeId(null);
      setIsCreatingNewType(false);
    }
    if (eventTypeId === typeId) {
      const remaining = customEventTypes.filter(t => t.id !== typeId);
      setEventTypeId(remaining[0]?.id || 'other');
    }
  };
  
  const isEditing = !!existingEvent;
  const [isDetailMode, setIsDetailMode] = useState(!!existingEvent);
  const coachMeta = parseCoachCalendarMeta(existingEvent?.recurrenceConfig);
  const canEditEventContent = !readOnly;

  // Compute default start/end based on defaultStartHour (Feature 5)
  const computeDefaultStart = () => {
    if (existingEvent) return existingEvent.start.split('T')[1]?.substring(0, 5) || '16:00';
    if (defaultStartHour !== undefined) {
      return `${String(defaultStartHour).padStart(2, '0')}:00`;
    }
    return '16:00';
  };

  const computeDefaultEnd = () => {
    if (existingEvent) return existingEvent.end.split('T')[1]?.substring(0, 5) || '18:00';
    if (defaultStartHour !== undefined) {
      const endHour = Math.min(defaultStartHour + 2, 23);
      return `${String(endHour).padStart(2, '0')}:00`;
    }
    return '18:00';
  };

  const [title, setTitle] = useState(existingEvent?.title || '');
  const [eventTypeId, setEventTypeId] = useState<string>(existingEvent?.eventTypeId || customEventTypes[0]?.id || 'other');
  const [startTime, setStartTime] = useState(computeDefaultStart());
  const [endTime, setEndTime] = useState(computeDefaultEnd());
  const [eventDate, setEventDate] = useState(existingEvent ? existingEvent.start.split('T')[0] : selectedDate); // Feature 6
  const [recurrence, setRecurrence] = useState<RecurrenceType>(existingEvent?.recurrence || 'none');
  const [selectedDays, setSelectedDays] = useState<number[]>(existingEvent?.recurrenceConfig?.days || []);
  const [selectedMonthDays, setSelectedMonthDays] = useState<number[]>(existingEvent?.recurrenceConfig?.monthDays || []); // Feature 8
  const [recurrenceEndDate, setRecurrenceEndDate] = useState<string>(existingEvent?.recurrenceEndDate || ''); // Feature 7
  const [applyOnlyToThis, setApplyOnlyToThis] = useState(false);
  const [anticipatedIntensity, setAnticipatedIntensity] = useState<'Low' | 'Moderate' | 'High' | undefined>(existingEvent?.anticipatedIntensity);
  const currentEventColor = existingEvent?.color || customEventTypes.find(type => type.id === (existingEvent?.eventTypeId || eventTypeId))?.color || '#845ef7';
  const [displayColor, setDisplayColor] = useState(currentEventColor);
  const [showColorSaveChoices, setShowColorSaveChoices] = useState(false);

  // Description: collapsed row by default, expands into a textarea on click.
  // For recurring-instance edits, prefer any per-occurrence override description.
  const initialDescription = (() => {
    if (existingEvent && isRecurringInstance && instanceDate) {
      const override = existingEvent.overrides?.[instanceDate];
      if (override && Object.prototype.hasOwnProperty.call(override, 'description')) {
        return override.description || '';
      }
    }
    return existingEvent?.description || '';
  })();
  const [description, setDescription] = useState<string>(initialDescription);
  // If editing an event that already has a description, start expanded so it's visible.
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState<boolean>(!!initialDescription);

  // Event types that support anticipated intensity are now driven by the
  // type's `isActivity` flag rather than a hardcoded id list. While the user
  // is creating a new type, fall back to the in-form Activity toggle.
  const selectedType = customEventTypes.find(t => t.id === eventTypeId);

  const [isCreatingNewType, setIsCreatingNewType] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeColor, setNewTypeColor] = useState('#845ef7');
  const [newTypeIsActivity, setNewTypeIsActivity] = useState(false);

  const resetTypeEditor = () => {
    setIsCreatingNewType(false);
    setEditingTypeId(null);
    setNewTypeName('');
    setNewTypeColor('#845ef7');
    setNewTypeIsActivity(false);
  };

  const startCreateType = () => {
    setDeleteTypeId(null);
    setEditingTypeId(null);
    setNewTypeName('');
    setNewTypeColor('#845ef7');
    setNewTypeIsActivity(false);
    setIsCreatingNewType(true);
  };

  const startEditType = (typeId: string) => {
    const type = customEventTypes.find(t => t.id === typeId);
    if (!type) return;
    setDeleteTypeId(null);
    setEditingTypeId(type.id);
    setNewTypeName(type.name);
    setNewTypeColor(type.color);
    setNewTypeIsActivity(type.isActivity ?? false);
    setIsCreatingNewType(true);
  };

  const showIntensityPicker = isCreatingNewType
    ? newTypeIsActivity
    : !!selectedType?.isActivity;

  const toggleDay = (day: number) => {
    if (selectedDays.includes(day)) {
      setSelectedDays(selectedDays.filter(d => d !== day));
    } else {
      setSelectedDays([...selectedDays, day]);
    }
  };

  // Feature 8: Toggle month day selection (max 4)
  const toggleMonthDay = (day: number) => {
    if (selectedMonthDays.includes(day)) {
      setSelectedMonthDays(selectedMonthDays.filter(d => d !== day));
    } else if (selectedMonthDays.length < 4) {
      setSelectedMonthDays([...selectedMonthDays, day]);
    }
  };

  // Feature 9: Save event type immediately without closing the modal
  const handleSaveEventType = () => {
    if (!newTypeName.trim()) return;
    const existingType = editingTypeId ? customEventTypes.find(type => type.id === editingTypeId) : undefined;
    const typeId = editingTypeId || uuidv4();
    saveCustomEventType({
      id: typeId,
      name: newTypeName.trim(),
      color: newTypeColor,
      icon: existingType?.icon,
      isBuiltIn: existingType?.isBuiltIn ?? false,
      isActivity: newTypeIsActivity,
    });
    setEventTypeId(typeId);
    resetTypeEditor();
  };

  const handleSave = () => {
    if (!canEditEventContent) return;

    let finalEventTypeId = eventTypeId;

    // If still in new-type creation mode and there's a name, save it on event save too
    if (isCreatingNewType && newTypeName.trim()) {
      const existingType = editingTypeId ? customEventTypes.find(type => type.id === editingTypeId) : undefined;
      finalEventTypeId = editingTypeId || uuidv4();
      saveCustomEventType({
        id: finalEventTypeId,
        name: newTypeName.trim(),
        color: newTypeColor,
        icon: existingType?.icon,
        isBuiltIn: existingType?.isBuiltIn ?? false,
        isActivity: newTypeIsActivity,
      });
    }

    // Resolve which type ultimately drives this event so the intensity field
    // is only persisted for activity-type events.
    const finalSelectedType =
      customEventTypes.find(t => t.id === finalEventTypeId) ||
      (isCreatingNewType && newTypeName.trim()
        ? { isActivity: newTypeIsActivity }
        : undefined);
    const finalIsActivity = !!finalSelectedType?.isActivity;
    const resolvedAnticipatedIntensity = finalIsActivity
      ? anticipatedIntensity
      : undefined;

    // Single-instance edit of a recurring event
    if (isEditing && isRecurringInstance && applyOnlyToThis && instanceDate && existingEvent) {
      const updatedEvent = { ...existingEvent };
      if (!updatedEvent.overrides) updatedEvent.overrides = {};
      updatedEvent.overrides[instanceDate] = {
        title,
        description: description || undefined,
        eventTypeId: finalEventTypeId,
        start: `${instanceDate}T${startTime}`,
        end: `${instanceDate}T${endTime}`,
      };
      saveCalendarEvent(updatedEvent);
      onClose();
      return;
    }

    const dateToUse = eventDate; // Feature 6: use user-selected date

    const event: CalendarEvent = {
      id: isEditing && existingEvent ? existingEvent.id : uuidv4(),
      eventTypeId: finalEventTypeId,
      title: title || undefined,
      description: description.trim() ? description : undefined,
      start: `${dateToUse}T${startTime}`,
      end: `${dateToUse}T${endTime}`,
      recurrence,
      recurrenceConfig: recurrence === 'weekly'
        ? { days: selectedDays }
        : recurrence === 'monthly'
        ? { monthDays: selectedMonthDays }
        : undefined,
      recurrenceEndDate: recurrence !== 'none' && recurrenceEndDate ? recurrenceEndDate : undefined, // Feature 7
      excludedDates: existingEvent?.excludedDates,
      overrides: existingEvent?.overrides,
      anticipatedIntensity: resolvedAnticipatedIntensity,
    };

    saveCalendarEvent(event);
    onClose();
  };

  const handleDelete = () => {
    if (!canEditEventContent) return;
    if (!existingEvent) return;

    // Single-instance delete of a recurring event
    if (isRecurringInstance && applyOnlyToThis && instanceDate) {
      const updatedEvent = { ...existingEvent };
      if (!updatedEvent.excludedDates) updatedEvent.excludedDates = [];
      updatedEvent.excludedDates.push(instanceDate);
      // Also remove any override for this date
      if (updatedEvent.overrides) {
        delete updatedEvent.overrides[instanceDate];
      }
      saveCalendarEvent(updatedEvent);
    } else {
      deleteCalendarEvent(existingEvent.id);
    }
    onClose();
  };

  const handleSaveColorOverride = (scope: 'event' | 'event_type' | 'coach') => {
    if (!existingEvent || !coachMeta?.coachId) return;

    saveCalendarEventColorOverride({
      scope,
      eventId: scope === 'event' ? existingEvent.id : undefined,
      eventTypeId: scope === 'event_type' ? eventTypeId : undefined,
      coachId: coachMeta.coachId,
      color: displayColor,
    });
    setShowColorSaveChoices(false);
  };

  const detailType = customEventTypes.find(type => type.id === eventTypeId);
  const detailDate = (instanceDate || eventDate);
  const detailTitle = title || detailType?.name || 'Event';
  const playerRsvpTarget = existingEvent
    ? getPlayerRsvpTargetFromCalendarEvent(existingEvent, detailDate, user?.id)
    : null;

  if (isDetailMode && existingEvent) {
    return (
      <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in touch-none p-4">
        <div className="bg-[var(--background)] w-full max-w-md rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden border border-[rgba(255,255,255,0.1)] animate-slide-up pb-safe">
          <div className="border-b border-[rgba(255,255,255,0.1)] p-4 flex justify-between items-center bg-[var(--card-bg)]">
            <h2 className="text-lg font-bold text-white">Event Details</h2>
            <div className="flex items-center gap-2">
              {canEditEventContent ? (
                <button
                  type="button"
                  onClick={() => setIsDetailMode(false)}
                  className="p-2 text-gray-300 hover:text-white rounded-full bg-[rgba(255,255,255,0.05)]"
                  aria-label="Edit event"
                >
                  <Pencil size={18} />
                </button>
              ) : null}
              <button onClick={onClose} className="p-2 text-gray-400 hover:text-white rounded-full bg-[rgba(255,255,255,0.05)]" aria-label="Close event details">
                <X size={20} />
              </button>
            </div>
          </div>

          <div className="p-5 overflow-y-auto max-h-[70vh] space-y-4">
            {readOnly ? (
              <div className="p-3 rounded-xl bg-[rgba(var(--accent-secondary-rgb),0.1)] border border-[rgba(var(--accent-secondary-rgb),0.25)] text-xs text-gray-200 font-medium flex items-center">
                <Lock size={14} className="mr-2 text-[var(--accent-secondary)]" />
                Assigned by coach
              </div>
            ) : null}

            <div className="flex items-start gap-3">
              <span className="mt-1 h-4 w-4 rounded-full border border-white/20" style={{ backgroundColor: displayColor }} />
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-400">Title</p>
                <p className="mt-1 text-lg font-bold text-white">{detailTitle}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-400">Type</p>
                <p className="mt-1 text-white">{detailType?.name || eventTypeId}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-400">Date</p>
                <p className="mt-1 text-white">{detailDate}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-400">Time</p>
                <p className="mt-1 text-white">{startTime} - {endTime}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-400">Intensity</p>
                <p className="mt-1 text-white">{anticipatedIntensity || '--'}</p>
              </div>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wider text-gray-400">Description</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-gray-200">{description || 'No description provided.'}</p>
            </div>

            {playerRsvpTarget ? <PlayerRsvpControl target={playerRsvpTarget} /> : null}

            {readOnly && coachMeta?.coachId ? (
              <div className="rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.04)] p-3">
                <div className="flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                    <Palette size={14} />
                    Display Color
                  </label>
                  <input
                    type="color"
                    value={displayColor}
                    onChange={(event) => {
                      setDisplayColor(event.target.value);
                      setShowColorSaveChoices(true);
                    }}
                    className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                  />
                </div>

                {showColorSaveChoices ? (
                  <div className="mt-3 space-y-2">
                    <button type="button" onClick={() => handleSaveColorOverride('event')} className="w-full rounded-lg bg-[rgba(255,255,255,0.08)] px-3 py-2 text-left text-xs font-semibold text-white">
                      Save only for this event
                    </button>
                    <button type="button" onClick={() => handleSaveColorOverride('event_type')} className="w-full rounded-lg bg-[rgba(255,255,255,0.08)] px-3 py-2 text-left text-xs font-semibold text-white">
                      Save for all coach-assigned events of this type
                    </button>
                    <button type="button" onClick={() => handleSaveColorOverride('coach')} className="w-full rounded-lg bg-[rgba(255,255,255,0.08)] px-3 py-2 text-left text-xs font-semibold text-white">
                      Save for all coach-assigned events
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in touch-none p-4">
      <div className="bg-[var(--background)] w-full max-w-md rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden border border-[rgba(255,255,255,0.1)] animate-slide-up pb-safe">
        
        {/* Header */}
        <div className="border-b border-[rgba(255,255,255,0.1)] p-4 flex justify-between items-center bg-[var(--card-bg)]">
          <h2 className="text-lg font-bold text-white">{readOnly ? 'Event Details' : isEditing ? 'Edit Event' : 'Add Event'}</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-white rounded-full bg-[rgba(255,255,255,0.05)]">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto max-h-[70vh]">
          {readOnly && (
            <div className="mb-5 p-3 rounded-xl bg-[rgba(var(--accent-secondary-rgb),0.1)] border border-[rgba(var(--accent-secondary-rgb),0.25)] text-xs text-gray-200 font-medium flex items-center">
              <Lock size={14} className="mr-2 text-[var(--accent-secondary)]" />
              Assigned by coach
            </div>
          )}

          <fieldset disabled={!canEditEventContent} className={!canEditEventContent ? 'opacity-80' : undefined}>
          
          {/* Single-instance toggle for recurring events */}
          {isEditing && isRecurringInstance && canEditEventContent && (
            <div className="mb-5 p-3 rounded-xl bg-[rgba(var(--accent-secondary-rgb),0.1)] border border-[rgba(var(--accent-secondary-rgb),0.2)]">
              <label className="flex items-center space-x-3 cursor-pointer touch-target">
                <input
                  type="checkbox"
                  checked={applyOnlyToThis}
                  onChange={(e) => setApplyOnlyToThis(e.target.checked)}
                  className="w-4 h-4 accent-[var(--accent-secondary)]"
                />
                <span className="text-xs text-gray-200 font-medium">Apply changes only to this event</span>
              </label>
            </div>
          )}

          <div className="mb-5">
            <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">Event Title <span className="text-gray-600">(optional)</span></label>
            <input 
              type="text" 
              placeholder="e.g. U16 Match vs Rovers"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-xl p-3 text-white focus:border-[var(--accent-primary)] focus:outline-none"
            />
          </div>

          <div className="mb-5">
            <div className="flex justify-between items-center mb-2">
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Event Type</label>
            </div>
            
            {!isCreatingNewType ? (
              <div className="flex flex-wrap gap-2">
                {customEventTypes.map(type => (
                  <button
                    key={type.id}
                    onClick={() => handleTypeClick(type.id)}
                    onPointerDown={() => startTypeTimer(type.id)}
                    onPointerUp={clearTypeTimer}
                    onPointerLeave={clearTypeTimer}
                    onPointerCancel={clearTypeTimer}
                    onContextMenu={(e) => e.preventDefault()}
                    className={`px-3 py-2 rounded-lg text-xs font-bold transition-all border ${
                      eventTypeId === type.id 
                        ? 'border-transparent text-black' 
                        : 'border-[rgba(255,255,255,0.1)] text-gray-300'
                    }`}
                    style={eventTypeId === type.id ? { backgroundColor: type.color } : {}}
                  >
                    {type.name}
                  </button>
                ))}
                <button 
                  onClick={startCreateType}
                  className="px-3 py-2 rounded-lg text-xs font-bold transition-all border border-dashed border-[rgba(255,255,255,0.3)] text-gray-300 flex items-center"
                >
                  <Plus size={14} className="mr-1" /> New
                </button>
              </div>
            ) : (
              <div className="p-3 bg-[rgba(255,255,255,0.05)] rounded-xl border border-[var(--accent-secondary)] animate-fade-in">
                <input 
                  type="text" 
                  placeholder="Custom Type Name"
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  className="w-full bg-transparent border-b border-[rgba(255,255,255,0.1)] pb-2 mb-3 text-white text-sm focus:outline-none"
                />

                {/* Activity Event toggle */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-gray-200">Activity Event</span>
                    <span className="text-[10px] text-gray-500">Adds an anticipated intensity</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={newTypeIsActivity}
                    onClick={() => setNewTypeIsActivity(v => !v)}
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
                    onChange={(e) => setNewTypeColor(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border-0 p-0 bg-transparent"
                  />
                  <div className="flex-1"></div>
                  {/* Feature 9: Save Event Type button */}
                  <button 
                    onClick={handleSaveEventType}
                    disabled={!newTypeName.trim()}
                    className="text-xs font-bold text-black bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg flex items-center transition-colors"
                  >
                    <Check size={12} className="mr-1" /> Save Type
                  </button>
                  <button 
                    onClick={resetTypeEditor}
                    className="text-xs text-gray-400 hover:text-white px-2 py-1"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Delete Event Type Confirmation Popup */}
          {deleteTypeId && (
            <div className="mt-2 p-3 rounded-xl bg-[rgba(255,107,107,0.1)] border border-[rgba(255,107,107,0.3)] animate-fade-in">
              <p className="text-xs text-gray-200 mb-3">
                Manage <span className="font-bold text-white">&ldquo;{customEventTypes.find(t => t.id === deleteTypeId)?.name}&rdquo;</span>
              </p>
              <div className="flex space-x-2">
                <button
                  onClick={() => startEditType(deleteTypeId)}
                  className="flex-1 py-2 rounded-lg text-xs font-bold bg-[rgba(255,255,255,0.08)] text-white flex items-center justify-center transition-transform active:scale-95"
                >
                  <Pencil size={14} className="mr-1.5" /> Edit
                </button>
                <button
                  onClick={() => handleDeleteType(deleteTypeId)}
                  className="flex-1 py-2 rounded-lg text-xs font-bold bg-[#ff6b6b] text-white flex items-center justify-center transition-transform active:scale-95"
                >
                  <Trash2 size={14} className="mr-1.5" /> Delete Event Type
                </button>
                <button
                  onClick={() => setDeleteTypeId(null)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-gray-400 bg-[rgba(255,255,255,0.05)] hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Feature 6: Date Selector */}
          <div className="mb-5">
            <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">Date</label>
            <input 
              type="date" 
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="w-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-xl p-3 text-white touch-target [color-scheme:dark]"
            />
          </div>

          <div className="flex space-x-4 mb-5">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">Start Time</label>
              <input 
                type="time" 
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-xl p-3 text-white touch-target"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">End Time</label>
              <input 
                type="time" 
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-xl p-3 text-white touch-target"
              />
            </div>
          </div>

          <div className="mb-5">
            <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">Recurrence</label>
            <div className="grid grid-cols-4 gap-2">
              {(['none', 'daily', 'weekly', 'monthly'] as RecurrenceType[]).map(r => (
                <button
                  key={r}
                  onClick={() => setRecurrence(r)}
                  className={`py-2 px-1 rounded-lg text-xs font-medium capitalize touch-target ${
                    recurrence === r 
                      ? 'bg-[var(--accent-secondary)] text-white font-bold' 
                      : 'bg-[rgba(255,255,255,0.05)] text-gray-400 border border-[rgba(255,255,255,0.1)]'
                  }`}
                >
                  {r === 'none' ? 'Once' : r}
                </button>
              ))}
            </div>
          </div>

          {/* Weekly day picker */}
          {recurrence === 'weekly' && (
            <div className="mb-6 animate-fade-in">
              <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">Select Days of Week</label>
              <div className="grid grid-cols-7 gap-1">
                {DAY_LABELS.map((label, i) => {
                  const dayNum = i + 1; // 1=Mon ... 7=Sun
                  const isSelected = selectedDays.includes(dayNum);
                  return (
                    <button
                      key={dayNum}
                      onClick={() => toggleDay(dayNum)}
                      className={`py-2 rounded-lg text-xs font-bold transition-all touch-target ${
                        isSelected
                          ? 'bg-[var(--accent-primary)] text-black'
                          : 'bg-[rgba(255,255,255,0.05)] text-gray-400 border border-[rgba(255,255,255,0.1)]'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Feature 8: Monthly day picker */}
          {recurrence === 'monthly' && (
            <div className="mb-6 animate-fade-in">
              <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">
                Select Days of Month <span className="text-gray-600">(max 4)</span>
              </label>
              <div className="grid grid-cols-7 gap-1.5">
                {Array.from({ length: 31 }, (_, i) => i + 1).map(day => {
                  const isSelected = selectedMonthDays.includes(day);
                  const isDisabled = !isSelected && selectedMonthDays.length >= 4;
                  return (
                    <button
                      key={day}
                      onClick={() => toggleMonthDay(day)}
                      disabled={isDisabled}
                      className={`py-1.5 rounded-lg text-xs font-bold transition-all touch-target ${
                        isSelected
                          ? 'bg-[var(--accent-primary)] text-black'
                          : isDisabled
                          ? 'bg-[rgba(255,255,255,0.02)] text-gray-700 cursor-not-allowed'
                          : 'bg-[rgba(255,255,255,0.05)] text-gray-400 border border-[rgba(255,255,255,0.1)]'
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
              {selectedMonthDays.length > 0 && (
                <p className="text-[10px] text-gray-500 mt-2">
                  Selected: {selectedMonthDays.sort((a, b) => a - b).join(', ')}
                  {selectedMonthDays.some(d => d > 28) && (
                    <span className="text-[var(--status-yellow)]"> · Days &gt;28 will use month&apos;s last day when needed</span>
                  )}
                </p>
              )}
            </div>
          )}

          {/* Feature 7: Recurrence End Date */}
          {recurrence !== 'none' && (
            <div className="mb-6 animate-fade-in">
              <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">
                End Date <span className="text-gray-600">(optional)</span>
              </label>
              <input 
                type="date" 
                value={recurrenceEndDate}
                onChange={(e) => setRecurrenceEndDate(e.target.value)}
                min={eventDate}
                className="w-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-xl p-3 text-white touch-target [color-scheme:dark]"
              />
              {recurrenceEndDate && (
                <button 
                  onClick={() => setRecurrenceEndDate('')}
                  className="mt-1.5 text-[10px] text-gray-500 hover:text-gray-300 underline"
                >
                  Clear end date (repeat forever)
                </button>
              )}
            </div>
          )}

          {/* Anticipated Intensity — only for training/gym/match event types */}
          {showIntensityPicker && (
            <div className="mb-6 animate-fade-in">
              <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">Anticipated Intensity</label>
              <div className="grid grid-cols-3 gap-2">
                {(['Low', 'Moderate', 'High'] as const).map(level => (
                  <button
                    key={level}
                    onClick={() => setAnticipatedIntensity(level)}
                    className={`py-2 px-1 rounded-lg text-xs font-medium touch-target ${
                      anticipatedIntensity === level
                        ? level === 'High' ? 'bg-[var(--status-red)] text-white font-bold'
                          : level === 'Moderate' ? 'bg-[var(--status-yellow)] text-black font-bold'
                          : 'bg-[var(--status-green)] text-black font-bold'
                        : 'bg-[rgba(255,255,255,0.05)] text-gray-400 border border-[rgba(255,255,255,0.1)]'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Description — collapsed row by default, expands into a textarea */}
          <div className="mb-6">
            {!isDescriptionExpanded ? (
              <button
                type="button"
                onClick={() => setIsDescriptionExpanded(true)}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] text-gray-300 hover:text-white hover:border-[rgba(255,255,255,0.2)] transition-colors touch-target"
              >
                <span className="flex items-center text-sm">
                  <FileText size={16} className="mr-2 text-gray-400" />
                  Add a description
                </span>
                <ChevronDown size={16} className="text-gray-400" />
              </button>
            ) : (
              <div className="animate-fade-in">
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Description <span className="text-gray-600">(optional)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsDescriptionExpanded(false)}
                    className="text-[10px] text-gray-500 hover:text-gray-300 underline"
                  >
                    Collapse
                  </button>
                </div>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Session summary, training plan, notes, or any extra details..."
                  rows={5}
                  className="w-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-xl p-3 text-white text-sm focus:border-[var(--accent-primary)] focus:outline-none resize-y min-h-[120px]"
                />
              </div>
            )}
          </div>
          </fieldset>

          {/* Action Buttons */}
          <div className="space-y-3">
            {canEditEventContent ? (
              <>
                <button 
                  onClick={handleSave}
                  className="w-full bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-tertiary)] text-black font-bold py-4 rounded-xl shadow-lg flex items-center justify-center touch-target transition-transform active:scale-95"
                >
                  <Save className="mr-2" size={20} /> {isEditing ? 'Update Event' : 'Save Event'}
                </button>

                {isEditing && (
                  <button 
                    onClick={handleDelete}
                    className="w-full bg-[rgba(255,107,107,0.1)] border border-[rgba(255,107,107,0.3)] text-[#ff6b6b] font-bold py-3 rounded-xl flex items-center justify-center touch-target transition-transform active:scale-95"
                  >
                    <Trash2 className="mr-2" size={18} /> {isRecurringInstance && applyOnlyToThis ? 'Delete This Occurrence' : 'Delete Event'}
                  </button>
                )}
              </>
            ) : (
              <button 
                onClick={onClose}
                className="w-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] text-white font-bold py-3 rounded-xl flex items-center justify-center touch-target transition-transform active:scale-95"
              >
                Close
              </button>
            )}
          </div>
          
        </div>
      </div>
    </div>
  );
}
