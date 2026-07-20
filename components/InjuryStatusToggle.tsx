'use client';

import { ShieldAlert } from 'lucide-react';

interface InjuryStatusToggleProps {
  checked: boolean;
  automaticallyEnabled: boolean;
  onChange: (checked: boolean) => void;
}

export function InjuryStatusToggle({
  checked,
  automaticallyEnabled,
  onChange,
}: InjuryStatusToggleProps) {
  const isLockedOn = checked && automaticallyEnabled;

  return (
    <div
      className={`rounded-xl border px-3 py-3 transition-colors ${
        checked
          ? 'border-[rgba(255,107,107,0.48)] bg-[rgba(255,107,107,0.12)]'
          : 'border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)]'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={`flex items-center gap-2 text-sm font-semibold ${checked ? 'text-[#ff6b6b]' : 'text-gray-200'}`}>
            <ShieldAlert size={16} className={checked ? 'text-[#ff6b6b]' : 'text-gray-400'} />
            <span>Is this an injury?</span>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label="Is this an injury?"
          disabled={isLockedOn}
          onClick={() => onChange(!checked)}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-80 ${
            checked ? 'bg-[#ff6b6b]' : 'bg-gray-600'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              checked ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    </div>
  );
}
