import type { PlayerViewMode } from '@/components/coach/players/types';

interface PlayerViewToggleProps {
  value: PlayerViewMode;
  onChange: (view: PlayerViewMode) => void;
}

const viewOptions: Array<{ id: PlayerViewMode; label: string }> = [
  { id: 'sheet', label: 'Sheet' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'calendar', label: 'Calendar' },
];

export function PlayerViewToggle({ value, onChange }: PlayerViewToggleProps) {
  return (
    <div className="inline-flex rounded-full border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.05)] p-1">
      {viewOptions.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={`rounded-full px-3 py-2 text-sm font-semibold transition-colors sm:px-4 ${
            value === option.id
              ? 'bg-[var(--card-bg)] text-white shadow-sm'
              : 'text-gray-400 hover:text-white'
          }`}
          aria-pressed={value === option.id}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
