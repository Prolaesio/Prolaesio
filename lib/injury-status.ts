import { differenceInCalendarDays, format, parseISO } from 'date-fns';

export type PainSignalSource = 'wellness' | 'training';

export const AUTOMATIC_INJURY_PAIN_THRESHOLD = 4.5;

export interface PainStatusSignal {
  id: string;
  date: string;
  createdAt?: string | null;
  source: PainSignalSource;
  painActive: boolean;
  painLevel?: number | null;
  painNotes?: string | null;
  isInjury?: boolean | null;
}

export function isAutomaticInjuryPainLevel(painLevel: number | null | undefined): boolean {
  return typeof painLevel === 'number' && Number.isFinite(painLevel) && painLevel >= AUTOMATIC_INJURY_PAIN_THRESHOLD;
}

export function shouldTreatPainAsInjury(
  signal: Pick<PainStatusSignal, 'painActive' | 'painLevel' | 'isInjury'>
): boolean {
  return Boolean(signal.isInjury) || Boolean(signal.painActive && isAutomaticInjuryPainLevel(signal.painLevel));
}

export function isPainReported(signal: PainStatusSignal): boolean {
  return signal.painActive || Boolean(signal.painNotes?.trim()) || shouldTreatPainAsInjury(signal);
}

export function sortPainSignalsNewestFirst(signals: PainStatusSignal[]): PainStatusSignal[] {
  return [...signals].sort((first, second) => {
    const dateComparison = second.date.localeCompare(first.date);
    if (dateComparison !== 0) return dateComparison;
    return (second.createdAt ?? '').localeCompare(first.createdAt ?? '');
  });
}

export function getLatestPainStatus(signals: PainStatusSignal[]): PainStatusSignal | null {
  return sortPainSignalsNewestFirst(signals)[0] ?? null;
}

export function describePainSignal(signal: PainStatusSignal): string {
  const notes = signal.painNotes?.trim();
  if (notes) return notes;
  if (signal.painLevel) {
    const signalType = shouldTreatPainAsInjury(signal) ? 'injury' : 'pain';
    return `${signal.source === 'wellness' ? 'Morning wellness' : 'Training'} ${signalType} reported (level ${signal.painLevel}/10)`;
  }
  return signal.source === 'wellness'
    ? 'Morning wellness injury/pain reported'
    : 'Training injury/pain reported';
}

export function formatReportedAgo(dateKey: string, asOfDate = new Date()): string {
  const daysAgo = differenceInCalendarDays(asOfDate, parseISO(dateKey));
  if (daysAgo <= 0) return 'reported today';
  if (daysAgo === 1) return 'reported 1 day ago';
  return `reported ${daysAgo} days ago`;
}

export function getLocalDateKey(date = new Date()): string {
  return format(date, 'yyyy-MM-dd');
}
