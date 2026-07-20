-- Adds a player-facing display name and stores explicit injury status on pain logs.
-- Existing role/profile migrations are left untouched.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_display_name_length'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_display_name_length
      CHECK (
        display_name IS NULL
        OR char_length(btrim(display_name)) BETWEEN 1 AND 80
      );
  END IF;
END;
$$;

COMMENT ON COLUMN public.profiles.display_name IS
  'Player-facing name shown to coaches. Authentication email remains unchanged.';

ALTER TABLE public.wellness_logs
  ADD COLUMN IF NOT EXISTS is_injury BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.training_logs
  ADD COLUMN IF NOT EXISTS is_injury BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE public.wellness_logs
SET is_injury = TRUE
WHERE pain_active IS TRUE
  AND pain_level >= 5
  AND is_injury IS DISTINCT FROM TRUE;

UPDATE public.training_logs
SET is_injury = TRUE
WHERE pain_active IS TRUE
  AND pain_level >= 5
  AND is_injury IS DISTINCT FROM TRUE;

CREATE OR REPLACE FUNCTION public.get_team_players(
  p_team_id UUID
)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  email TEXT,
  age INTEGER,
  height_cm NUMERIC,
  weight_kg NUMERIC,
  positions TEXT[],
  joined_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_manage_team(p_team_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to view this team.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    tm.user_id::UUID AS user_id,
    coalesce(
      nullif(trim(p.display_name), ''),
      nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(split_part(coalesce(u.email::TEXT, ''::TEXT), '@'::TEXT, 1), ''),
      concat('Player '::TEXT, left(tm.user_id::TEXT, 8))
    )::TEXT AS display_name,
    u.email::TEXT AS email,
    p.age::INTEGER AS age,
    p.height_cm::NUMERIC AS height_cm,
    p.weight_kg::NUMERIC AS weight_kg,
    coalesce(p.positions, '{}'::TEXT[])::TEXT[] AS positions,
    tm.joined_at::TIMESTAMPTZ AS joined_at
  FROM public.team_memberships tm
  LEFT JOIN public.profiles p
    ON p.id = tm.user_id
  LEFT JOIN auth.users u
    ON u.id = tm.user_id
  WHERE tm.team_id = p_team_id
    AND tm.role = 'player'
    AND tm.status = 'active'
  ORDER BY tm.joined_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_calendar_event_attendance_roster(
  p_team_id UUID,
  p_event_group_id TEXT,
  p_occurrence_date DATE
)
RETURNS TABLE (
  player_id UUID,
  display_name TEXT,
  email TEXT,
  rsvp_status TEXT,
  rsvp_updated_at TIMESTAMPTZ,
  attendance_status TEXT,
  attendance_updated_at TIMESTAMPTZ,
  attendance_recorded_by UUID
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_user_id UUID;
  event_scope RECORD;
BEGIN
  active_user_id := auth.uid();

  IF active_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_manage_team(p_team_id, active_user_id) THEN
    RAISE EXCEPTION 'Not authorized to view attendance for this team.' USING ERRCODE = '42501';
  END IF;

  SELECT scope.assignment_scope, scope.assigned_player_id
  INTO event_scope
  FROM public.get_coach_calendar_event_scope(p_team_id, p_event_group_id, p_occurrence_date) AS scope
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attendance is not available for this event.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    tm.user_id::UUID AS player_id,
    coalesce(
      nullif(trim(p.display_name), ''),
      nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(split_part(coalesce(u.email::TEXT, ''::TEXT), '@'::TEXT, 1), ''),
      concat('Player '::TEXT, left(tm.user_id::TEXT, 8))
    )::TEXT AS display_name,
    u.email::TEXT AS email,
    cea.rsvp_status::TEXT AS rsvp_status,
    cea.rsvp_updated_at::TIMESTAMPTZ AS rsvp_updated_at,
    cea.attendance_status::TEXT AS attendance_status,
    cea.attendance_updated_at::TIMESTAMPTZ AS attendance_updated_at,
    cea.attendance_recorded_by::UUID AS attendance_recorded_by
  FROM public.team_memberships tm
  LEFT JOIN public.profiles p
    ON p.id = tm.user_id
  LEFT JOIN auth.users u
    ON u.id = tm.user_id
  LEFT JOIN public.calendar_event_attendance cea
    ON cea.team_id = p_team_id
   AND cea.event_group_id = p_event_group_id
   AND cea.occurrence_date = p_occurrence_date
   AND cea.player_id = tm.user_id
  WHERE tm.team_id = p_team_id
    AND tm.role = 'player'
    AND tm.status = 'active'
    AND (
      event_scope.assignment_scope = 'team'
      OR tm.user_id = event_scope.assigned_player_id
    )
  ORDER BY display_name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_team_players(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_calendar_event_attendance_roster(UUID, TEXT, DATE) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_team_players(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_calendar_event_attendance_roster(UUID, TEXT, DATE) TO authenticated;
