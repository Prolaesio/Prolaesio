-- Player-owned display color overrides for coach-assigned calendar events.
-- These rows never change the canonical coach event or another player's view.

CREATE TABLE IF NOT EXISTS public.player_calendar_event_color_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('event', 'event_type', 'coach')),
  event_id UUID REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  event_type_id TEXT,
  coach_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  color TEXT NOT NULL CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT player_calendar_event_color_override_scope_fields CHECK (
    (scope = 'event' AND event_id IS NOT NULL)
    OR (scope = 'event_type' AND event_type_id IS NOT NULL AND coach_id IS NOT NULL)
    OR (scope = 'coach' AND coach_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS player_calendar_event_color_overrides_event_unique
  ON public.player_calendar_event_color_overrides (user_id, event_id)
  WHERE scope = 'event';

CREATE UNIQUE INDEX IF NOT EXISTS player_calendar_event_color_overrides_type_unique
  ON public.player_calendar_event_color_overrides (user_id, coach_id, event_type_id)
  WHERE scope = 'event_type';

CREATE UNIQUE INDEX IF NOT EXISTS player_calendar_event_color_overrides_coach_unique
  ON public.player_calendar_event_color_overrides (user_id, coach_id)
  WHERE scope = 'coach';

ALTER TABLE public.player_calendar_event_color_overrides ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'player_calendar_event_color_overrides'
      AND policyname = 'Users can view own calendar color overrides'
  ) THEN
    CREATE POLICY "Users can view own calendar color overrides"
      ON public.player_calendar_event_color_overrides
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'player_calendar_event_color_overrides'
      AND policyname = 'Users can insert own calendar color overrides'
  ) THEN
    CREATE POLICY "Users can insert own calendar color overrides"
      ON public.player_calendar_event_color_overrides
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'player_calendar_event_color_overrides'
      AND policyname = 'Users can update own calendar color overrides'
  ) THEN
    CREATE POLICY "Users can update own calendar color overrides"
      ON public.player_calendar_event_color_overrides
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'player_calendar_event_color_overrides'
      AND policyname = 'Users can delete own calendar color overrides'
  ) THEN
    CREATE POLICY "Users can delete own calendar color overrides"
      ON public.player_calendar_event_color_overrides
      FOR DELETE
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at_player_calendar_event_color_overrides
  ON public.player_calendar_event_color_overrides;

CREATE TRIGGER set_updated_at_player_calendar_event_color_overrides
  BEFORE UPDATE ON public.player_calendar_event_color_overrides
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
