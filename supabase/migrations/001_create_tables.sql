-- ============================================================
-- Prolaesio: Full Database Schema + Row Level Security
-- Run this in your Supabase Dashboard → SQL Editor
-- ============================================================

-- ========================
-- 1. PROFILES
-- ========================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  age INTEGER NOT NULL DEFAULT 18 CHECK (age >= 1 AND age <= 99),
  positions TEXT[] NOT NULL DEFAULT '{}',
  priorities TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
-- ========================
-- 2. WELLNESS LOGS
-- ========================
CREATE TABLE IF NOT EXISTS public.wellness_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  sleep_time TEXT NOT NULL,
  wake_time TEXT NOT NULL,
  sleep_duration NUMERIC NOT NULL,
  sleep_quality INTEGER NOT NULL CHECK (sleep_quality >= 1 AND sleep_quality <= 10),
  energy INTEGER NOT NULL CHECK (energy >= 1 AND energy <= 10),
  fatigue INTEGER NOT NULL CHECK (fatigue >= 1 AND fatigue <= 10),
  stress INTEGER NOT NULL CHECK (stress >= 1 AND stress <= 10),
  pain_active BOOLEAN NOT NULL DEFAULT false,
  pain_level INTEGER CHECK (pain_level >= 1 AND pain_level <= 10),
  pain_notes TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);
ALTER TABLE public.wellness_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own wellness logs"
  ON public.wellness_logs FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own wellness logs"
  ON public.wellness_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own wellness logs"
  ON public.wellness_logs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own wellness logs"
  ON public.wellness_logs FOR DELETE
  USING (auth.uid() = user_id);
-- ========================
-- 3. TRAINING LOGS
-- ========================
CREATE TABLE IF NOT EXISTS public.training_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  session_type TEXT NOT NULL,
  duration INTEGER NOT NULL,
  distance NUMERIC,
  intensity INTEGER NOT NULL CHECK (intensity >= 1 AND intensity <= 10),
  sprinting TEXT NOT NULL DEFAULT 'no',
  performance INTEGER NOT NULL CHECK (performance >= 1 AND performance <= 10),
  pain_active BOOLEAN NOT NULL DEFAULT false,
  pain_level INTEGER CHECK (pain_level >= 1 AND pain_level <= 10),
  pain_notes TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.training_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own training logs"
  ON public.training_logs FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own training logs"
  ON public.training_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own training logs"
  ON public.training_logs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own training logs"
  ON public.training_logs FOR DELETE
  USING (auth.uid() = user_id);
-- ========================
-- 4. CALENDAR EVENTS
-- ========================
CREATE TABLE IF NOT EXISTS public.calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type_id TEXT NOT NULL,
  title TEXT,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  color TEXT,
  recurrence TEXT NOT NULL DEFAULT 'none',
  recurrence_config JSONB DEFAULT '{}',
  excluded_dates JSONB DEFAULT '[]',
  overrides JSONB DEFAULT '{}',
  anticipated_intensity TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own calendar events"
  ON public.calendar_events FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own calendar events"
  ON public.calendar_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own calendar events"
  ON public.calendar_events FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own calendar events"
  ON public.calendar_events FOR DELETE
  USING (auth.uid() = user_id);
-- ========================
-- 5. CUSTOM EVENT TYPES
-- ========================
CREATE TABLE IF NOT EXISTS public.custom_event_types (
  id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  icon TEXT,
  is_built_in BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, user_id)
);
ALTER TABLE public.custom_event_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own custom event types"
  ON public.custom_event_types FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own custom event types"
  ON public.custom_event_types FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own custom event types"
  ON public.custom_event_types FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own custom event types"
  ON public.custom_event_types FOR DELETE
  USING (auth.uid() = user_id);
-- ========================
-- 6. INJURIES
-- ========================
CREATE TABLE IF NOT EXISTS public.injuries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  doctor_notes TEXT,
  expected_return DATE,
  status TEXT NOT NULL DEFAULT 'active',
  auto_tracked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.injuries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own injuries"
  ON public.injuries FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own injuries"
  ON public.injuries FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own injuries"
  ON public.injuries FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own injuries"
  ON public.injuries FOR DELETE
  USING (auth.uid() = user_id);
-- ========================
-- 7. HELPER: auto-update updated_at
-- ========================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at_wellness_logs
  BEFORE UPDATE ON public.wellness_logs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at_training_logs
  BEFORE UPDATE ON public.training_logs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at_calendar_events
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at_custom_event_types
  BEFORE UPDATE ON public.custom_event_types
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at_injuries
  BEFORE UPDATE ON public.injuries
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
