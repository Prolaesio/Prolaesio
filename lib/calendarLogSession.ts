import { CustomEventType, SessionType } from './types';

function containsAny(value: string, candidates: string[]): boolean {
  return candidates.some(candidate => value.includes(candidate));
}

export function mapCalendarEventToSessionType(
  eventTypeId: string,
  customEventTypes: CustomEventType[],
  fallbackText?: string
): SessionType {
  const eventTypeName = customEventTypes.find(type => type.id === eventTypeId)?.name || '';
  const haystack = `${eventTypeId} ${eventTypeName} ${fallbackText || ''}`.toLowerCase();

  if (containsAny(haystack, ['match', 'game', 'fixture'])) return 'Match';
  if (containsAny(haystack, ['gym', 'strength', 'weights'])) return 'Gym';
  if (containsAny(haystack, ['team', 'squad'])) return 'Team';
  if (containsAny(haystack, ['partner', 'duo'])) return 'Partner';
  if (containsAny(haystack, ['solo', 'individual', 'personal', '1v1', 'one-to-one'])) return 'Solo';
  return 'Other';
}

export function computeDurationMinutes(
  startHour: number,
  startMinute: number,
  endHour: number,
  endMinute: number
): number {
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  const raw = end - start;
  if (raw > 0) return raw;
  return raw === 0 ? 60 : raw + 24 * 60;
}
