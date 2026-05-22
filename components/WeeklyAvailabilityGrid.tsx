'use client';

import React from 'react';
import { WeeklyAvailability } from '@/lib/types';
import {
  AVAILABILITY_HOURS,
  DAY_LABELS_SHORT,
  ISO_WEEKDAYS,
  formatHourLabel,
} from '@/lib/onboarding';

interface WeeklyAvailabilityGridProps {
  value: WeeklyAvailability;
  onChange: (next: WeeklyAvailability) => void;
}

/**
 * Mobile-friendly weekly availability grid.
 *
 * Each cell represents an (ISO weekday, hour) pair. Tapping toggles that
 * specific block, mirroring how time blocks are selected in the calendar.
 */
export function WeeklyAvailabilityGrid({ value, onChange }: WeeklyAvailabilityGridProps) {
  const isSelected = (day: number, hour: number): boolean => {
    return !!value[day]?.includes(hour);
  };

  const toggle = (day: number, hour: number) => {
    const current = value[day] ? [...value[day]] : [];
    const idx = current.indexOf(hour);
    if (idx >= 0) current.splice(idx, 1);
    else current.push(hour);
    current.sort((a, b) => a - b);
    onChange({ ...value, [day]: current });
  };

  return (
    <div className="glass-card p-3 overflow-x-auto">
      <div className="min-w-[480px]">
        {/* Header row */}
        <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] gap-1 mb-1">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 px-1" />
          {ISO_WEEKDAYS.map((day, idx) => (
            <div
              key={day}
              className="text-center text-[10px] font-bold uppercase tracking-wider text-gray-300"
            >
              {DAY_LABELS_SHORT[idx]}
            </div>
          ))}
        </div>

        {/* Rows */}
        <div className="space-y-1">
          {AVAILABILITY_HOURS.map(hour => (
            <div
              key={hour}
              className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] gap-1 items-stretch"
            >
              <div className="text-[10px] text-gray-400 font-medium pr-2 flex items-center justify-end">
                {formatHourLabel(hour)}
              </div>
              {ISO_WEEKDAYS.map(day => {
                const selected = isSelected(day, hour);
                return (
                  <button
                    key={`${day}-${hour}`}
                    type="button"
                    onClick={() => toggle(day, hour)}
                    aria-pressed={selected}
                    className={`h-8 rounded-md transition-colors border ${
                      selected
                        ? 'bg-[var(--accent-primary)] border-[var(--accent-primary)]'
                        : 'bg-[rgba(255,255,255,0.04)] border-[rgba(255,255,255,0.08)] hover:border-[var(--accent-secondary)]'
                    }`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-gray-500 mt-3 leading-relaxed">
        Tap a block to mark yourself as available. Tap again to deselect.
      </p>
    </div>
  );
}
