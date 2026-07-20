-- Attendance and RSVP tracking for coach-managed team calendar events.
-- RSVP is player-owned; confirmed attendance is coach-owned.

CREATE TABLE IF NOT EXISTS public.event_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  event_group_id TEXT NOT NULL,
  event_date DATE NOT NULL,
  player_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rsvp_status TEXT CHECK (rsvp_status IN ('going', 'not_going')),
  attendance_status TEXT CHECK (attendance_status IN ('attended', 'absent')),
  rsvp_updated_at TIMESTAMPTZ,
  attendance_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, event_group_id, event_date, player_id)
);
CREATE INDEX IF NOT EXISTS event_attendance_event_idx
  ON public.event_attendance (team_id, event_group_id, event_date);
CREATE INDEX IF NOT EXISTS event_attendance_player_idx
  ON public.event_attendance (player_id, event_date DESC);
ALTER TABLE public.event_attendance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Players and coaches can view event attendance" ON public.event_attendance;
CREATE POLICY "Players and coaches can view event attendance"
  ON public.event_attendance
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = player_id
    OR public.can_manage_team(team_id, auth.uid())
  );
DROP POLICY IF EXISTS "Coaches can create event attendance" ON public.event_attendance;
CREATE POLICY "Coaches can create event attendance"
  ON public.event_attendance
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_manage_team(team_id, auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.team_memberships tm
      WHERE tm.team_id = event_attendance.team_id
        AND tm.user_id = event_attendance.player_id
        AND tm.role = 'player'
        AND tm.status = 'active'
    )
  );
DROP POLICY IF EXISTS "Coaches can update event attendance" ON public.event_attendance;
CREATE POLICY "Coaches can update event attendance"
  ON public.event_attendance
  FOR UPDATE
  TO authenticated
  USING (public.can_manage_team(team_id, auth.uid()))
  WITH CHECK (
    public.can_manage_team(team_id, auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.team_memberships tm
      WHERE tm.team_id = event_attendance.team_id
        AND tm.user_id = event_attendance.player_id
        AND tm.role = 'player'
        AND tm.status = 'active'
    )
  );
DROP POLICY IF EXISTS "Coaches can delete event attendance" ON public.event_attendance;
CREATE POLICY "Coaches can delete event attendance"
  ON public.event_attendance
  FOR DELETE
  TO authenticated
  USING (public.can_manage_team(team_id, auth.uid()));
-- Players use this narrow RPC instead of writing the table directly. This
-- prevents a player from changing the coach-owned attendance_status column.
CREATE OR REPLACE FUNCTION public.set_event_rsvp(
  p_team_id UUID,
  p_event_group_id TEXT,
  p_event_date DATE,
  p_rsvp_status TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_rsvp_status IS NOT NULL AND p_rsvp_status NOT IN ('going', 'not_going') THEN
    RAISE EXCEPTION 'Invalid RSVP status';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.team_memberships tm
    WHERE tm.team_id = p_team_id
      AND tm.user_id = auth.uid()
      AND tm.role = 'player'
      AND tm.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Active player membership required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.calendar_events ce
    WHERE ce.user_id = auth.uid()
      AND ce.recurrence_config -> 'meta' ->> 'coachManaged' = 'true'
      AND ce.recurrence_config -> 'meta' ->> 'teamId' = p_team_id::TEXT
      AND ce.recurrence_config -> 'meta' ->> 'eventGroupId' = p_event_group_id
      AND COALESCE((ce.recurrence_config -> 'meta' ->> 'published')::BOOLEAN, true)
  ) THEN
    RAISE EXCEPTION 'Coach-managed team event not found';
  END IF;

  INSERT INTO public.event_attendance (
    team_id,
    event_group_id,
    event_date,
    player_id,
    rsvp_status,
    rsvp_updated_at
  )
  VALUES (
    p_team_id,
    p_event_group_id,
    p_event_date,
    auth.uid(),
    p_rsvp_status,
    now()
  )
  ON CONFLICT (team_id, event_group_id, event_date, player_id)
  DO UPDATE SET
    rsvp_status = EXCLUDED.rsvp_status,
    rsvp_updated_at = now(),
    updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.set_event_rsvp(UUID, TEXT, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_event_rsvp(UUID, TEXT, DATE, TEXT) TO authenticated;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'handle_updated_at'
      AND pg_function_is_visible(oid)
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'set_updated_at_event_attendance'
  ) THEN
    CREATE TRIGGER set_updated_at_event_attendance
      BEFORE UPDATE ON public.event_attendance
      FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
END;
$$;
