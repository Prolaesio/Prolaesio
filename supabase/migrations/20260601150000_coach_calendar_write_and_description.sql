-- Migration: Coach calendar write policies + event description persistence
-- Date: 2026-06-01
--
-- 1) Adds a `description` column to calendar_events so event/task details
--    persist across coach and player calendar views.
-- 2) Grants coaches write access to calendar_events rows for active players
--    on teams they manage, while preserving existing own-row permissions.

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS description TEXT;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'calendar_events'
      AND policyname = 'Coaches can insert managed team player calendar events'
  ) THEN
    CREATE POLICY "Coaches can insert managed team player calendar events"
      ON public.calendar_events
      FOR INSERT
      TO authenticated
      WITH CHECK (
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
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'calendar_events'
      AND policyname = 'Coaches can update managed team player calendar events'
  ) THEN
    CREATE POLICY "Coaches can update managed team player calendar events"
      ON public.calendar_events
      FOR UPDATE
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
      )
      WITH CHECK (
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
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'calendar_events'
      AND policyname = 'Coaches can delete managed team player calendar events'
  ) THEN
    CREATE POLICY "Coaches can delete managed team player calendar events"
      ON public.calendar_events
      FOR DELETE
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
