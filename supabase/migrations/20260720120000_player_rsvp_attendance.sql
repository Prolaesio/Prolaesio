-- Player RSVP and coach-confirmed attendance for coach-created calendar events.
-- Records are keyed by the stable coach event group plus the specific occurrence date.

CREATE TABLE IF NOT EXISTS public.calendar_event_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  event_group_id TEXT NOT NULL CHECK (length(btrim(event_group_id)) > 0),
  occurrence_date DATE NOT NULL,
  player_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rsvp_status TEXT CHECK (rsvp_status IN ('going', 'not_going')),
  rsvp_updated_at TIMESTAMPTZ,
  attendance_status TEXT CHECK (attendance_status IN ('did', 'did_not')),
  attendance_recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  attendance_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, event_group_id, occurrence_date, player_id)
);

CREATE INDEX IF NOT EXISTS calendar_event_attendance_event_idx
  ON public.calendar_event_attendance (team_id, event_group_id, occurrence_date);

CREATE INDEX IF NOT EXISTS calendar_event_attendance_player_idx
  ON public.calendar_event_attendance (player_id, occurrence_date DESC);

CREATE INDEX IF NOT EXISTS calendar_event_attendance_team_player_idx
  ON public.calendar_event_attendance (team_id, player_id);

ALTER TABLE public.calendar_event_attendance ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'set_updated_at_calendar_event_attendance'
  ) THEN
    CREATE TRIGGER set_updated_at_calendar_event_attendance
      BEFORE UPDATE ON public.calendar_event_attendance
      FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'calendar_event_attendance'
      AND policyname = 'Players can view own event attendance'
  ) THEN
    CREATE POLICY "Players can view own event attendance"
      ON public.calendar_event_attendance
      FOR SELECT
      TO authenticated
      USING (auth.uid() = player_id);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'calendar_event_attendance'
      AND policyname = 'Coaches can view managed team event attendance'
  ) THEN
    CREATE POLICY "Coaches can view managed team event attendance"
      ON public.calendar_event_attendance
      FOR SELECT
      TO authenticated
      USING (public.can_manage_team(team_id, auth.uid()));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_active_team_player(
  p_team_id UUID,
  p_player_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_memberships tm
    WHERE tm.team_id = p_team_id
      AND tm.user_id = p_player_id
      AND tm.role = 'player'
      AND tm.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.calendar_event_occurs_on(
  p_start_time TEXT,
  p_recurrence TEXT,
  p_recurrence_config JSONB,
  p_recurrence_end_date DATE,
  p_excluded_dates JSONB,
  p_occurrence_date DATE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  event_start_date DATE;
  normalized_recurrence TEXT;
  iso_day INTEGER;
  day_of_month INTEGER;
  last_day_of_month INTEGER;
  configured_month_day INTEGER;
BEGIN
  IF p_occurrence_date IS NULL THEN
    RETURN FALSE;
  END IF;

  event_start_date := split_part(coalesce(p_start_time, ''), 'T', 1)::DATE;

  IF coalesce(p_excluded_dates, '[]'::JSONB) ? p_occurrence_date::TEXT THEN
    RETURN FALSE;
  END IF;

  IF p_occurrence_date < event_start_date THEN
    RETURN FALSE;
  END IF;

  IF p_recurrence_end_date IS NOT NULL AND p_occurrence_date > p_recurrence_end_date THEN
    RETURN FALSE;
  END IF;

  normalized_recurrence := coalesce(nullif(lower(btrim(coalesce(p_recurrence, 'none'))), ''), 'none');

  IF normalized_recurrence = 'none' THEN
    RETURN p_occurrence_date = event_start_date;
  END IF;

  IF normalized_recurrence = 'daily' THEN
    RETURN TRUE;
  END IF;

  IF normalized_recurrence = 'weekly' THEN
    iso_day := extract(isodow FROM p_occurrence_date)::INTEGER;
    RETURN EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(coalesce(p_recurrence_config -> 'days', '[]'::JSONB)) AS day_values(day_value)
      WHERE day_values.day_value::INTEGER = iso_day
    );
  END IF;

  IF normalized_recurrence = 'monthly' THEN
    day_of_month := extract(day FROM p_occurrence_date)::INTEGER;
    last_day_of_month := extract(day FROM (date_trunc('month', p_occurrence_date)::DATE + INTERVAL '1 month - 1 day'))::INTEGER;

    FOR configured_month_day IN
      SELECT month_values.month_day::INTEGER
      FROM jsonb_array_elements_text(coalesce(p_recurrence_config -> 'monthDays', '[]'::JSONB)) AS month_values(month_day)
    LOOP
      IF configured_month_day = day_of_month THEN
        RETURN TRUE;
      END IF;

      IF configured_month_day > last_day_of_month AND day_of_month = last_day_of_month THEN
        RETURN TRUE;
      END IF;
    END LOOP;
  END IF;

  RETURN FALSE;
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_coach_calendar_event_scope(
  p_team_id UUID,
  p_event_group_id TEXT,
  p_occurrence_date DATE
)
RETURNS TABLE (
  assignment_scope TEXT,
  assigned_player_id UUID
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    CASE
      WHEN event_meta.meta ->> 'assignmentScope' IN ('team', 'player') THEN event_meta.meta ->> 'assignmentScope'
      ELSE 'player'
    END::TEXT AS assignment_scope,
    CASE
      WHEN event_meta.meta ->> 'assignmentScope' = 'team' THEN NULL::UUID
      ELSE coalesce(nullif(event_meta.meta ->> 'assignedPlayerId', '')::UUID, ce.user_id)
    END AS assigned_player_id
  FROM public.calendar_events ce
  CROSS JOIN LATERAL (
    SELECT coalesce(ce.recurrence_config, '{}'::JSONB) -> 'meta' AS meta
  ) event_meta
  WHERE event_meta.meta ->> 'coachManaged' = 'true'
    AND event_meta.meta ->> 'teamId' = p_team_id::TEXT
    AND event_meta.meta ->> 'eventGroupId' = p_event_group_id
    AND event_meta.meta ->> 'kind' = 'event'
    AND coalesce(event_meta.meta ->> 'published', 'true') <> 'false'
    AND public.calendar_event_occurs_on(
      ce.start_time,
      ce.recurrence,
      coalesce(ce.recurrence_config, '{}'::JSONB),
      ce.recurrence_end_date,
      coalesce(ce.excluded_dates, '[]'::JSONB),
      p_occurrence_date
    )
  ORDER BY ce.created_at ASC
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.calendar_event_attendance_player_is_eligible(
  p_team_id UUID,
  p_event_group_id TEXT,
  p_occurrence_date DATE,
  p_player_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event_scope RECORD;
BEGIN
  IF p_team_id IS NULL OR p_event_group_id IS NULL OR btrim(p_event_group_id) = '' OR p_occurrence_date IS NULL OR p_player_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT scope.assignment_scope, scope.assigned_player_id
  INTO event_scope
  FROM public.get_coach_calendar_event_scope(p_team_id, p_event_group_id, p_occurrence_date) AS scope
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF event_scope.assignment_scope = 'team' THEN
    RETURN public.is_active_team_player(p_team_id, p_player_id);
  END IF;

  RETURN event_scope.assigned_player_id = p_player_id
    AND public.is_active_team_player(p_team_id, p_player_id);
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
      nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
      split_part(coalesce(u.email::TEXT, ''::TEXT), '@'::TEXT, 1),
      concat('Player '::TEXT, left(tm.user_id::TEXT, 8))
    )::TEXT AS display_name,
    u.email::TEXT AS email,
    cea.rsvp_status::TEXT AS rsvp_status,
    cea.rsvp_updated_at::TIMESTAMPTZ AS rsvp_updated_at,
    cea.attendance_status::TEXT AS attendance_status,
    cea.attendance_updated_at::TIMESTAMPTZ AS attendance_updated_at,
    cea.attendance_recorded_by::UUID AS attendance_recorded_by
  FROM public.team_memberships tm
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

CREATE OR REPLACE FUNCTION public.get_my_calendar_event_attendance(
  p_team_id UUID,
  p_event_group_id TEXT,
  p_occurrence_date DATE
)
RETURNS TABLE (
  rsvp_status TEXT,
  rsvp_updated_at TIMESTAMPTZ,
  attendance_status TEXT,
  attendance_updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  active_user_id UUID;
BEGIN
  active_user_id := auth.uid();

  IF active_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.calendar_event_attendance_player_is_eligible(p_team_id, p_event_group_id, p_occurrence_date, active_user_id) THEN
    RAISE EXCEPTION 'RSVP is not available for this event.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    cea.rsvp_status::TEXT,
    cea.rsvp_updated_at::TIMESTAMPTZ,
    cea.attendance_status::TEXT,
    cea.attendance_updated_at::TIMESTAMPTZ
  FROM (SELECT 1) seed
  LEFT JOIN public.calendar_event_attendance cea
    ON cea.team_id = p_team_id
   AND cea.event_group_id = p_event_group_id
   AND cea.occurrence_date = p_occurrence_date
   AND cea.player_id = active_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_my_calendar_event_rsvp(
  p_team_id UUID,
  p_event_group_id TEXT,
  p_occurrence_date DATE,
  p_rsvp_status TEXT
)
RETURNS TABLE (
  rsvp_status TEXT,
  rsvp_updated_at TIMESTAMPTZ,
  attendance_status TEXT,
  attendance_updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  active_user_id UUID;
BEGIN
  active_user_id := auth.uid();

  IF active_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  IF p_rsvp_status IS NOT NULL AND p_rsvp_status NOT IN ('going', 'not_going') THEN
    RAISE EXCEPTION 'Invalid RSVP status.' USING ERRCODE = '22023';
  END IF;

  IF NOT public.calendar_event_attendance_player_is_eligible(p_team_id, p_event_group_id, p_occurrence_date, active_user_id) THEN
    RAISE EXCEPTION 'RSVP is not available for this event.' USING ERRCODE = '42501';
  END IF;

  IF p_rsvp_status IS NULL AND NOT EXISTS (
    SELECT 1
    FROM public.calendar_event_attendance cea
    WHERE cea.team_id = p_team_id
      AND cea.event_group_id = p_event_group_id
      AND cea.occurrence_date = p_occurrence_date
      AND cea.player_id = active_user_id
  ) THEN
    RETURN QUERY SELECT NULL::TEXT, NULL::TIMESTAMPTZ, NULL::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  RETURN QUERY
  INSERT INTO public.calendar_event_attendance (
    team_id,
    event_group_id,
    occurrence_date,
    player_id,
    rsvp_status,
    rsvp_updated_at
  )
  VALUES (
    p_team_id,
    p_event_group_id,
    p_occurrence_date,
    active_user_id,
    p_rsvp_status,
    now()
  )
  ON CONFLICT (team_id, event_group_id, occurrence_date, player_id)
  DO UPDATE SET
    rsvp_status = EXCLUDED.rsvp_status,
    rsvp_updated_at = now(),
    updated_at = now()
  RETURNING
    calendar_event_attendance.rsvp_status::TEXT,
    calendar_event_attendance.rsvp_updated_at::TIMESTAMPTZ,
    calendar_event_attendance.attendance_status::TEXT,
    calendar_event_attendance.attendance_updated_at::TIMESTAMPTZ;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_calendar_event_attendance(
  p_team_id UUID,
  p_event_group_id TEXT,
  p_occurrence_date DATE,
  p_player_id UUID,
  p_attendance_status TEXT
)
RETURNS TABLE (
  player_id UUID,
  rsvp_status TEXT,
  rsvp_updated_at TIMESTAMPTZ,
  attendance_status TEXT,
  attendance_updated_at TIMESTAMPTZ,
  attendance_recorded_by UUID
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  active_user_id UUID;
BEGIN
  active_user_id := auth.uid();

  IF active_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  IF p_attendance_status IS NOT NULL AND p_attendance_status NOT IN ('did', 'did_not') THEN
    RAISE EXCEPTION 'Invalid attendance status.' USING ERRCODE = '22023';
  END IF;

  IF NOT public.can_manage_team(p_team_id, active_user_id) THEN
    RAISE EXCEPTION 'Not authorized to record attendance for this team.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.calendar_event_attendance_player_is_eligible(p_team_id, p_event_group_id, p_occurrence_date, p_player_id) THEN
    RAISE EXCEPTION 'This player is not eligible for attendance on this event.' USING ERRCODE = '42501';
  END IF;

  IF p_attendance_status IS NULL AND NOT EXISTS (
    SELECT 1
    FROM public.calendar_event_attendance cea
    WHERE cea.team_id = p_team_id
      AND cea.event_group_id = p_event_group_id
      AND cea.occurrence_date = p_occurrence_date
      AND cea.player_id = p_player_id
  ) THEN
    RETURN QUERY SELECT p_player_id, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::UUID;
    RETURN;
  END IF;

  RETURN QUERY
  INSERT INTO public.calendar_event_attendance (
    team_id,
    event_group_id,
    occurrence_date,
    player_id,
    attendance_status,
    attendance_recorded_by,
    attendance_updated_at
  )
  VALUES (
    p_team_id,
    p_event_group_id,
    p_occurrence_date,
    p_player_id,
    p_attendance_status,
    CASE WHEN p_attendance_status IS NULL THEN NULL ELSE active_user_id END,
    now()
  )
  ON CONFLICT (team_id, event_group_id, occurrence_date, player_id)
  DO UPDATE SET
    attendance_status = EXCLUDED.attendance_status,
    attendance_recorded_by = EXCLUDED.attendance_recorded_by,
    attendance_updated_at = now(),
    updated_at = now()
  RETURNING
    calendar_event_attendance.player_id::UUID,
    calendar_event_attendance.rsvp_status::TEXT,
    calendar_event_attendance.rsvp_updated_at::TIMESTAMPTZ,
    calendar_event_attendance.attendance_status::TEXT,
    calendar_event_attendance.attendance_updated_at::TIMESTAMPTZ,
    calendar_event_attendance.attendance_recorded_by::UUID;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_calendar_event_attendance_for_occurrence(
  p_team_id UUID,
  p_event_group_id TEXT,
  p_occurrence_date DATE,
  p_player_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_user_id UUID;
  deleted_count INTEGER;
BEGIN
  active_user_id := auth.uid();

  IF active_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_manage_team(p_team_id, active_user_id) THEN
    RAISE EXCEPTION 'Not authorized to clean up attendance for this team.' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.calendar_event_attendance cea
  WHERE cea.team_id = p_team_id
    AND cea.event_group_id = p_event_group_id
    AND cea.occurrence_date = p_occurrence_date
    AND (p_player_id IS NULL OR cea.player_id = p_player_id);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_calendar_event_attendance_for_group(
  p_team_id UUID,
  p_event_group_id TEXT,
  p_player_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_user_id UUID;
  deleted_count INTEGER;
BEGIN
  active_user_id := auth.uid();

  IF active_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_manage_team(p_team_id, active_user_id) THEN
    RAISE EXCEPTION 'Not authorized to clean up attendance for this team.' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.calendar_event_attendance cea
  WHERE cea.team_id = p_team_id
    AND cea.event_group_id = p_event_group_id
    AND (p_player_id IS NULL OR cea.player_id = p_player_id);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON public.calendar_event_attendance FROM anon, authenticated;
GRANT SELECT ON public.calendar_event_attendance TO authenticated;

REVOKE ALL ON FUNCTION public.is_active_team_player(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.calendar_event_occurs_on(TEXT, TEXT, JSONB, DATE, JSONB, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_coach_calendar_event_scope(UUID, TEXT, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.calendar_event_attendance_player_is_eligible(UUID, TEXT, DATE, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_calendar_event_attendance_roster(UUID, TEXT, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_calendar_event_attendance(UUID, TEXT, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_my_calendar_event_rsvp(UUID, TEXT, DATE, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_calendar_event_attendance(UUID, TEXT, DATE, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_calendar_event_attendance_for_occurrence(UUID, TEXT, DATE, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_calendar_event_attendance_for_group(UUID, TEXT, UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_calendar_event_attendance_roster(UUID, TEXT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_calendar_event_attendance(UUID, TEXT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_calendar_event_rsvp(UUID, TEXT, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_calendar_event_attendance(UUID, TEXT, DATE, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_calendar_event_attendance_for_occurrence(UUID, TEXT, DATE, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_calendar_event_attendance_for_group(UUID, TEXT, UUID) TO authenticated;
