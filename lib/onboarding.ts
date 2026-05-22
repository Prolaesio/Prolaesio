import { TrainingResource } from './types';

export const TRAINING_RESOURCE_OPTIONS: { id: TrainingResource; label: string; description: string }[] = [
  { id: 'gym', label: 'Gym', description: 'Weight room, racks, machines' },
  { id: 'soccer-field', label: 'Soccer Field', description: 'Full or half-field access' },
  { id: 'open-area', label: 'Open Area', description: 'Park, backyard, open space' },
  { id: 'wall', label: 'Wall', description: 'For passing/rebound work' },
  { id: 'treadmill-or-outdoor-runs', label: 'Treadmill / Outdoor Runs', description: 'Steady-state and intervals' },
];

export const POSITION_OPTIONS = [
  { id: 'GK', label: 'Goalkeeper' },
  { id: 'CB', label: 'Center Back' },
  { id: 'FB', label: 'Full Back' },
  { id: 'CM', label: 'Center Mid' },
  { id: 'AM', label: 'Attacking Mid' },
  { id: 'W', label: 'Winger' },
  { id: 'ST', label: 'Striker' },
] as const;

// Weekly availability is a Mon-Sun grid. Days use ISO weekdays (1 = Mon … 7 = Sun).
export const DAY_LABELS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const ISO_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

// Hour blocks shown in the availability grid. We use 6 AM – 11 PM to keep the
// grid mobile-friendly while still covering the practical training window.
export const AVAILABILITY_HOURS = Array.from({ length: 18 }, (_, i) => i + 6);

export function formatHourLabel(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}
