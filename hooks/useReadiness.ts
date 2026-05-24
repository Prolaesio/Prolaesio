import { useMemo } from 'react';
import { format, isSameDay, parseISO, getDay, isBefore } from 'date-fns';
import { useData } from '../lib/DataContext';
import { calculateReadiness, ReadinessResult } from '../lib/readiness';
import { generateRecommendation, RecommendationResult } from '../lib/recommendations';
import { useTrainingLoad } from './useTrainingLoad';
import { CalendarEvent } from '../lib/types';

export interface ComprehensiveReadiness {
  readiness: ReadinessResult;
  recommendation: RecommendationResult;
  hasWellnessToday: boolean;
}

export function useReadiness(): ComprehensiveReadiness {
  const { wellnessLogs, profile, injuries, calendarEvents } = useData();
  const load = useTrainingLoad();

  return useMemo(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const todayLog = wellnessLogs[todayStr];
    const historicalLogs = Object.values(wellnessLogs);

    const readinessResult = calculateReadiness(
      todayLog,
      historicalLogs,
      load.loadScore,
      load.hasAcuteData,
      load.hasChronicData
    );

    // Gather today's calendar events (including recurring) that have anticipatedIntensity
    const today = new Date();
    const dayOfWeek = getDay(today) === 0 ? 7 : getDay(today);
    const todaysEvents: CalendarEvent[] = [];

    calendarEvents.forEach(event => {
      const eventStartDate = event.start.split('T')[0];
      if (event.excludedDates?.includes(todayStr)) return;

      let matches = false;
      if (event.recurrence === 'none') {
        if (eventStartDate === todayStr) matches = true;
      } else if (event.recurrence === 'daily') {
        if (!isBefore(today, parseISO(eventStartDate))) matches = true;
      } else if (event.recurrence === 'weekly') {
        if (!isBefore(today, parseISO(eventStartDate)) && event.recurrenceConfig?.days?.includes(dayOfWeek)) {
          matches = true;
        }
      }

      if (matches) {
        // Apply per-date override if it exists
        const override = event.overrides?.[todayStr];
        const mergedEvent = override ? { ...event, ...override } : event;
        todaysEvents.push(mergedEvent as CalendarEvent);
      }
    });

    const recommendationResult = generateRecommendation(
      readinessResult,
      load,
      injuries.filter(i => i.status === 'active'),
      profile,
      todaysEvents
    );

    return {
      readiness: readinessResult,
      recommendation: recommendationResult,
      hasWellnessToday: !!todayLog,
    };
  }, [wellnessLogs, load, injuries, profile, calendarEvents]);
}
