-- Migration: Coach read access to managed team player data
-- Date: 2026-05-27
--
-- Adds read-only SELECT policies so coaches can query real player profile,
-- wellness, training, and calendar rows for players on teams they manage.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Coaches can view managed team player profiles'
  ) THEN
    CREATE POLICY "Coaches can view managed team player profiles"
      ON public.profiles
      FOR SELECT
      TO authenticated
      USING (
        auth.uid() = id
        OR EXISTS (
          SELECT 1
          FROM public.team_memberships tm
          WHERE tm.user_id = profiles.id
            AND tm.role = 'player'
            AND tm.status = 'active'
            AND public.can_manage_team(tm.team_id, auth.uid())
        )
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'wellness_logs'
      AND policyname = 'Coaches can view managed team player wellness logs'
  ) THEN
    CREATE POLICY "Coaches can view managed team player wellness logs"
      ON public.wellness_logs
      FOR SELECT
      TO authenticated
      USING (
        auth.uid() = user_id
        OR EXISTS (
          SELECT 1
          FROM public.team_memberships tm
          WHERE tm.user_id = wellness_logs.user_id
            AND tm.role = 'player'
            AND tm.status = 'active'
            AND public.can_manage_team(tm.team_id, auth.uid())
        )
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'training_logs'
      AND policyname = 'Coaches can view managed team player training logs'
  ) THEN
    CREATE POLICY "Coaches can view managed team player training logs"
      ON public.training_logs
      FOR SELECT
      TO authenticated
      USING (
        auth.uid() = user_id
        OR EXISTS (
          SELECT 1
          FROM public.team_memberships tm
          WHERE tm.user_id = training_logs.user_id
            AND tm.role = 'player'
            AND tm.status = 'active'
            AND public.can_manage_team(tm.team_id, auth.uid())
        )
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'calendar_events'
      AND policyname = 'Coaches can view managed team player calendar events'
  ) THEN
    CREATE POLICY "Coaches can view managed team player calendar events"
      ON public.calendar_events
      FOR SELECT
      TO authenticated
      USING (
        auth.uid() = user_id
        OR EXISTS (
          SELECT 1
          FROM public.team_memberships tm
          WHERE tm.user_id = calendar_events.user_id
            AND tm.role = 'player'
            AND tm.status = 'active'
            AND public.can_manage_team(tm.team_id, auth.uid())
        )
      );
  END IF;
END;
$$;
