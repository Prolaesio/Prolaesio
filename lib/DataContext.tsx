'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { StorageService } from './storage';
import { useAuth } from './AuthContext';
import { UserProfile, WellnessLog, TrainingLog, CalendarEvent, CalendarEventColorOverride, CustomEventType, InjuryRecord } from './types';

interface DataContextType {
  profile: UserProfile | null;
  wellnessLogs: Record<string, WellnessLog>;
  trainingLogs: TrainingLog[];
  calendarEvents: CalendarEvent[];
  calendarEventColorOverrides: CalendarEventColorOverride[];
  customEventTypes: CustomEventType[];
  injuries: InjuryRecord[];
  
  saveProfile: (profile: UserProfile) => void;
  saveWellnessLog: (log: WellnessLog) => void;
  saveTrainingLog: (log: TrainingLog) => void;
  deleteTrainingLog: (logId: string) => void;
  saveCalendarEvent: (event: CalendarEvent) => void;
  deleteCalendarEvent: (eventId: string) => void;
  saveCalendarEventColorOverride: (override: CalendarEventColorOverride) => void;
  saveCustomEventType: (type: CustomEventType) => void;
  deleteCustomEventType: (typeId: string) => void;
  saveInjury: (injury: InjuryRecord) => void;
  isLoading: boolean;
}

const defaultContext: DataContextType = {
  profile: null,
  wellnessLogs: {},
  trainingLogs: [],
  calendarEvents: [],
  calendarEventColorOverrides: [],
  customEventTypes: [],
  injuries: [],
  saveProfile: () => {},
  saveWellnessLog: () => {},
  saveTrainingLog: () => {},
  deleteTrainingLog: () => {},
  saveCalendarEvent: () => {},
  deleteCalendarEvent: () => {},
  saveCalendarEventColorOverride: () => {},
  saveCustomEventType: () => {},
  deleteCustomEventType: () => {},
  saveInjury: () => {},
  isLoading: true,
};

const DataContext = createContext<DataContextType>(defaultContext);

export const useData = () => useContext(DataContext);

export const DataProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();

  const [data, setData] = useState<Omit<DataContextType, 'saveProfile' | 'saveWellnessLog' | 'saveTrainingLog' | 'deleteTrainingLog' | 'saveCalendarEvent' | 'deleteCalendarEvent' | 'saveCalendarEventColorOverride' | 'saveCustomEventType' | 'deleteCustomEventType' | 'saveInjury'>>({
    profile: null,
    wellnessLogs: {},
    trainingLogs: [],
    calendarEvents: [],
    calendarEventColorOverrides: [],
    customEventTypes: [],
    injuries: [],
    isLoading: true,
  });

  // Load all data from Supabase when the user is authenticated
  useEffect(() => {
    if (!user) {
      setData({
        profile: null,
        wellnessLogs: {},
        trainingLogs: [],
        calendarEvents: [],
        calendarEventColorOverrides: [],
        customEventTypes: [],
        injuries: [],
        isLoading: false,
      });
      return;
    }

    const loadData = async () => {
      setData(prev => ({ ...prev, isLoading: true }));

      const [profile, wellnessLogs, trainingLogs, calendarEvents, calendarEventColorOverrides, customEventTypes, injuries] = await Promise.all([
        StorageService.getProfile(),
        StorageService.getWellnessLogs(),
        StorageService.getTrainingLogs(),
        StorageService.getCalendarEvents(),
        StorageService.getCalendarEventColorOverrides(),
        StorageService.getCustomEventTypes(),
        StorageService.getInjuries(),
      ]);

      setData({
        profile,
        wellnessLogs,
        trainingLogs,
        calendarEvents,
        calendarEventColorOverrides,
        customEventTypes,
        injuries,
        isLoading: false,
      });
    };

    loadData();
  }, [user]);

  const saveProfile = useCallback((profile: UserProfile) => {
    StorageService.saveProfile(profile);
    setData((prev) => ({ ...prev, profile }));
  }, []);

  const saveWellnessLog = useCallback((log: WellnessLog) => {
    StorageService.saveWellnessLog(log);
    setData((prev) => ({
      ...prev,
      wellnessLogs: { ...prev.wellnessLogs, [log.date]: log },
    }));
  }, []);

  const saveTrainingLog = useCallback((log: TrainingLog) => {
    StorageService.saveTrainingLog(log);
    setData((prev) => {
      const logs = [...prev.trainingLogs];
      const index = logs.findIndex((l) => l.id === log.id);
      if (index >= 0) logs[index] = log;
      else logs.push(log);
      return { ...prev, trainingLogs: logs };
    });
  }, []);

  const deleteTrainingLog = useCallback((logId: string) => {
    StorageService.deleteTrainingLog(logId);
    setData((prev) => ({
      ...prev,
      trainingLogs: prev.trainingLogs.filter((log) => log.id !== logId),
    }));
  }, []);

  const saveCalendarEvent = useCallback((event: CalendarEvent) => {
    StorageService.saveCalendarEvent(event);
    setData((prev) => {
      const events = [...prev.calendarEvents];
      const index = events.findIndex((e) => e.id === event.id);
      if (index >= 0) events[index] = event;
      else events.push(event);
      return { ...prev, calendarEvents: events };
    });
  }, []);

  const deleteCalendarEvent = useCallback((eventId: string) => {
    StorageService.deleteCalendarEvent(eventId);
    setData((prev) => ({
      ...prev,
      calendarEvents: prev.calendarEvents.filter((e) => e.id !== eventId),
    }));
  }, []);

  const saveCalendarEventColorOverride = useCallback((override: CalendarEventColorOverride) => {
    StorageService.saveCalendarEventColorOverride(override).then((savedOverride) => {
      if (!savedOverride) return;
      setData((prev) => {
        const overrides = [...prev.calendarEventColorOverrides];
        const index = overrides.findIndex((candidate) => {
          if (savedOverride.scope !== candidate.scope) return false;
          if (savedOverride.scope === 'event') return savedOverride.eventId === candidate.eventId;
          if (savedOverride.scope === 'event_type') {
            return savedOverride.coachId === candidate.coachId && savedOverride.eventTypeId === candidate.eventTypeId;
          }
          return savedOverride.coachId === candidate.coachId;
        });
        if (index >= 0) overrides[index] = savedOverride;
        else overrides.push(savedOverride);
        return { ...prev, calendarEventColorOverrides: overrides };
      });
    });
  }, []);

  const saveCustomEventType = useCallback((type: CustomEventType) => {
    StorageService.saveCustomEventType(type);
    setData((prev) => {
      const types = [...prev.customEventTypes];
      const index = types.findIndex((t) => t.id === type.id);
      if (index >= 0) types[index] = type;
      else types.push(type);
      return { ...prev, customEventTypes: types };
    });
  }, []);

  const deleteCustomEventType = useCallback((typeId: string) => {
    StorageService.deleteCustomEventType(typeId);
    setData((prev) => ({
      ...prev,
      customEventTypes: prev.customEventTypes.filter((t) => t.id !== typeId),
    }));
  }, []);

  const saveInjury = useCallback((injury: InjuryRecord) => {
    StorageService.saveInjury(injury);
    setData((prev) => {
      const injuries = [...prev.injuries];
      const index = injuries.findIndex((i) => i.id === injury.id);
      if (index >= 0) injuries[index] = injury;
      else injuries.push(injury);
      return { ...prev, injuries: injuries };
    });
  }, []);

  return (
    <DataContext.Provider
      value={{
        ...data,
        saveProfile,
        saveWellnessLog,
        saveTrainingLog,
        deleteTrainingLog,
        saveCalendarEvent,
        deleteCalendarEvent,
        saveCalendarEventColorOverride,
        saveCustomEventType,
        deleteCustomEventType,
        saveInjury,
      }}
    >
      {children}
    </DataContext.Provider>
  );
};
