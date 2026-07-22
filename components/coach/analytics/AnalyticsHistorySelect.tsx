import { historyRangeOptions, type AnalyticsHistoryRange } from '@/components/coach/analytics/historyRange';

interface AnalyticsHistorySelectProps {
  value: AnalyticsHistoryRange;
  onChange: (value: AnalyticsHistoryRange) => void;
}

export function AnalyticsHistorySelect({ value, onChange }: AnalyticsHistorySelectProps) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-300">
      History:
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as AnalyticsHistoryRange)}
        className="min-w-[148px] appearance-none rounded-lg border border-[rgba(255,255,255,0.16)] bg-[rgba(var(--surface-shell-rgb),0.96)] px-3 py-2 text-sm font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition-colors focus:border-[var(--accent-secondary)] focus:bg-[rgba(var(--surface-shell-rgb),1)]"
      >
        {historyRangeOptions.map((option) => (
          <option key={option.value} value={option.value} className="bg-[var(--background)] text-white">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
