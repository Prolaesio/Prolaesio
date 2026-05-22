import { supabase } from './supabase';
import {
  UserProfile,
  WellnessLog,
  TrainingLog,
  CalendarEvent,
  CustomEventType,
  InjuryRecord,
} from './types';

export class StorageService {
  // --- Profile ---
  static async getProfile(): Promise<UserProfile | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error || !data) return null;

    return {
      age: data.age,
      dateOfBirth: data.date_of_birth ?? undefined,
      positions: data.positions || [],
      priorities: data.priorities || [],
      heightCm: data.height_cm != null ? Number(data.height_cm) : undefined,
      weightKg: data.weight_kg != null ? Number(data.weight_kg) : undefined,
      teamCode: data.team_code ?? undefined,
      availability: data.availability ?? undefined,
      trainingResources: data.training_resources ?? undefined,
      onboardingCompleted: data.onboarding_completed ?? false,
    };
  }

  static async saveProfile(profile: UserProfile): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        age: profile.age,
        date_of_birth: profile.dateOfBirth ?? null,
        positions: profile.positions,
        priorities: profile.priorities,
        height_cm: profile.heightCm ?? null,
        weight_kg: profile.weightKg ?? null,
        team_code: profile.teamCode ?? null,
        availability: profile.availability ?? {},
        training_resources: profile.trainingResources ?? [],
        onboarding_completed: profile.onboardingCompleted ?? false,
      }, { onConflict: 'id' });

    if (error) console.error('Error saving profile:', error);
  }

  // --- Wellness Logs ---
  static async getWellnessLogs(): Promise<Record<string, WellnessLog>> {
    const { data, error } = await supabase
      .from('wellness_logs')
      .select('*')
      .order('date', { ascending: false });

    if (error || !data) return {};

    const logs: Record<string, WellnessLog> = {};
    data.forEach((row: any) => {
      logs[row.date] = {
        date: row.date,
        sleepTime: row.sleep_time,
        wakeTime: row.wake_time,
        sleepDuration: Number(row.sleep_duration),
        sleepQuality: row.sleep_quality,
        energy: row.energy,
        fatigue: row.fatigue,
        stress: row.stress,
        painActive: row.pain_active,
        painLevel: row.pain_level ?? undefined,
        painNotes: row.pain_notes ?? undefined,
        notes: row.notes ?? undefined,
      };
    });
    return logs;
  }

  static async saveWellnessLog(log: WellnessLog): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Upsert based on user_id + date unique constraint
    const { error } = await supabase
      .from('wellness_logs')
      .upsert({
        user_id: user.id,
        date: log.date,
        sleep_time: log.sleepTime,
        wake_time: log.wakeTime,
        sleep_duration: log.sleepDuration,
        sleep_quality: log.sleepQuality,
        energy: log.energy,
        fatigue: log.fatigue,
        stress: log.stress,
        pain_active: log.painActive,
        pain_level: log.painLevel ?? null,
        pain_notes: log.painNotes ?? null,
        notes: log.notes ?? null,
      }, { onConflict: 'user_id,date' });

    if (error) console.error('Error saving wellness log:', error);
  }

  // --- Training Logs ---
  static async getTrainingLogs(): Promise<TrainingLog[]> {
    const { data, error } = await supabase
      .from('training_logs')
      .select('*')
      .order('date', { ascending: false });

    if (error || !data) return [];

    return data.map((row: any) => ({
      id: row.id,
      date: row.date,
      sessionType: row.session_type,
      duration: row.duration,
      distance: row.distance != null ? Number(row.distance) : undefined,
      intensity: row.intensity,
      sprinting: row.sprinting,
      performance: row.performance,
      painActive: row.pain_active,
      painLevel: row.pain_level ?? undefined,
      painNotes: row.pain_notes ?? undefined,
      notes: row.notes ?? undefined,
    }));
  }

  static async saveTrainingLog(log: TrainingLog): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('training_logs')
      .upsert({
        id: log.id,
        user_id: user.id,
        date: log.date,
        session_type: log.sessionType,
        duration: log.duration,
        distance: log.distance ?? null,
        intensity: log.intensity,
        sprinting: log.sprinting,
        performance: log.performance,
        pain_active: log.painActive,
        pain_level: log.painLevel ?? null,
        pain_notes: log.painNotes ?? null,
        notes: log.notes ?? null,
      }, { onConflict: 'id' });

    if (error) console.error('Error saving training log:', error);
  }

  // --- Calendar Events ---
  static async getCalendarEvents(): Promise<CalendarEvent[]> {
    const { data, error } = await supabase
      .from('calendar_events')
      .select('*')
      .order('start_time', { ascending: true });

    if (error || !data) return [];

    return data.map((row: any) => ({
      id: row.id,
      eventTypeId: row.event_type_id,
      title: row.title ?? undefined,
      start: row.start_time,
      end: row.end_time,
      color: row.color ?? undefined,
      recurrence: row.recurrence,
      recurrenceConfig: row.recurrence_config ?? undefined,
      recurrenceEndDate: row.recurrence_end_date ?? undefined,
      excludedDates: row.excluded_dates ?? undefined,
      overrides: row.overrides ?? undefined,
      anticipatedIntensity: row.anticipated_intensity ?? undefined,
    }));
  }

  static async saveCalendarEvent(event: CalendarEvent): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('calendar_events')
      .upsert({
        id: event.id,
        user_id: user.id,
        event_type_id: event.eventTypeId,
        title: event.title ?? null,
        start_time: event.start,
        end_time: event.end,
        color: event.color ?? null,
        recurrence: event.recurrence,
        recurrence_config: event.recurrenceConfig ?? {},
        recurrence_end_date: event.recurrenceEndDate ?? null,
        excluded_dates: event.excludedDates ?? [],
        overrides: event.overrides ?? {},
        anticipated_intensity: event.anticipatedIntensity ?? null,
      }, { onConflict: 'id' });

    if (error) console.error('Error saving calendar event:', error);
  }

  static async deleteCalendarEvent(eventId: string): Promise<void> {
    const { error } = await supabase
      .from('calendar_events')
      .delete()
      .eq('id', eventId);

    if (error) console.error('Error deleting calendar event:', error);
  }

  // --- Custom Event Types ---
  static async getCustomEventTypes(): Promise<CustomEventType[]> {
    const defaultTypes: CustomEventType[] = [
      { id: 'school', name: 'School', color: '#4a9eff', icon: 'Book', isBuiltIn: true, isActivity: false },
      { id: 'team-training', name: 'Team Training', color: '#00d4aa', icon: 'Users', isBuiltIn: true, isActivity: true },
      { id: 'match', name: 'Match', color: '#ff6b6b', icon: 'Trophy', isBuiltIn: true, isActivity: true },
      { id: 'personal-training', name: 'Personal Training', color: '#ffd43b', icon: 'Activity', isBuiltIn: true, isActivity: true },
      { id: 'gym', name: 'Gym', color: '#845ef7', icon: 'Dumbbell', isBuiltIn: true, isActivity: true },
      { id: 'other', name: 'Other', color: '#adb5bd', icon: 'Calendar', isBuiltIn: true, isActivity: false },
    ];

    const { data, error } = await supabase
      .from('custom_event_types')
      .select('*');

    type EventTypeRow = CustomEventType & { isDeleted?: boolean };

    const overrides: EventTypeRow[] = (error || !data) ? [] : data.map((row: any) => ({
      id: row.id,
      name: row.name,
      color: row.color,
      icon: row.icon ?? undefined,
      isBuiltIn: row.is_built_in ?? false,
      isActivity: row.is_activity ?? false,
      isDeleted: row.is_deleted ?? false,
    }));

    // Merge built-in configuration with user overrides, then drop tombstoned types
    const mappedTypes: EventTypeRow[] = [...defaultTypes];
    overrides.forEach((o) => {
      const idx = mappedTypes.findIndex((m) => m.id === o.id);
      if (idx >= 0) {
        mappedTypes[idx] = { ...mappedTypes[idx], ...o };
      } else {
        mappedTypes.push(o);
      }
    });

    return mappedTypes
      .filter((t) => !t.isDeleted)
      .map(({ isDeleted: _isDeleted, ...rest }) => rest);
  }

  static async saveCustomEventType(eventType: CustomEventType): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('custom_event_types')
      .upsert({
        id: eventType.id,
        user_id: user.id,
        name: eventType.name,
        color: eventType.color,
        icon: eventType.icon ?? null,
        is_built_in: eventType.isBuiltIn ?? false,
        is_activity: eventType.isActivity ?? false,
        is_deleted: false,
      }, { onConflict: 'id,user_id' });

    if (error) console.error('Error saving custom event type:', error);
  }

  // Built-in/default event type IDs are defined in code, not the database, so
  // a hard delete would just resurrect them on the next read. For those, we
  // upsert a tombstone row (`is_deleted = true`) keyed by (id, user_id) so the
  // type is hidden for that user only.
  private static readonly BUILT_IN_EVENT_TYPE_IDS = new Set<string>([
    'school',
    'team-training',
    'match',
    'personal-training',
    'gym',
    'other',
  ]);

  static async deleteCustomEventType(typeId: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();

    if (StorageService.BUILT_IN_EVENT_TYPE_IDS.has(typeId)) {
      if (!user) return;
      const { error } = await supabase
        .from('custom_event_types')
        .upsert({
          id: typeId,
          user_id: user.id,
          name: typeId,
          color: '#000000',
          icon: null,
          is_built_in: true,
          is_activity: false,
          is_deleted: true,
        }, { onConflict: 'id,user_id' });

      if (error) console.error('Error hiding built-in event type:', error);
      return;
    }

    const { error } = await supabase
      .from('custom_event_types')
      .delete()
      .eq('id', typeId);

    if (error) console.error('Error deleting custom event type:', error);
  }

  // --- Injuries ---
  static async getInjuries(): Promise<InjuryRecord[]> {
    const { data, error } = await supabase
      .from('injuries')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !data) return [];

    return data.map((row: any) => ({
      id: row.id,
      description: row.description,
      doctorNotes: row.doctor_notes ?? undefined,
      expectedReturn: row.expected_return ?? undefined,
      status: row.status,
      createdAt: row.created_at,
      autoTracked: row.auto_tracked ?? undefined,
    }));
  }

  static async saveInjury(injury: InjuryRecord): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('injuries')
      .upsert({
        id: injury.id,
        user_id: user.id,
        description: injury.description,
        doctor_notes: injury.doctorNotes ?? null,
        expected_return: injury.expectedReturn ?? null,
        status: injury.status,
        created_at: injury.createdAt,
        auto_tracked: injury.autoTracked ?? false,
      }, { onConflict: 'id' });

    if (error) console.error('Error saving injury:', error);
  }
}
