'use client';

import React from 'react';
import { TrainingResource } from '@/lib/types';
import { TRAINING_RESOURCE_OPTIONS } from '@/lib/onboarding';
import { Check } from 'lucide-react';

interface TrainingResourcePickerProps {
  value: TrainingResource[];
  onChange: (next: TrainingResource[]) => void;
}

export function TrainingResourcePicker({ value, onChange }: TrainingResourcePickerProps) {
  const toggle = (id: TrainingResource) => {
    if (value.includes(id)) {
      onChange(value.filter(v => v !== id));
    } else {
      onChange([...value, id]);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-2">
      {TRAINING_RESOURCE_OPTIONS.map(option => {
        const selected = value.includes(option.id);
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => toggle(option.id)}
            className={`w-full flex items-center justify-between p-3 rounded-xl border transition-colors text-left touch-target ${
              selected
                ? 'border-[var(--accent-primary)] bg-[rgba(0,212,170,0.12)]'
                : 'border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.04)] hover:border-[var(--accent-secondary)]'
            }`}
          >
            <div>
              <p className="text-sm font-bold text-white">{option.label}</p>
              <p className="text-[11px] text-gray-400">{option.description}</p>
            </div>
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center border ${
                selected
                  ? 'bg-[var(--accent-primary)] border-[var(--accent-primary)]'
                  : 'border-[rgba(255,255,255,0.2)]'
              }`}
            >
              {selected && <Check size={14} className="text-black" strokeWidth={3} />}
            </div>
          </button>
        );
      })}
    </div>
  );
}
