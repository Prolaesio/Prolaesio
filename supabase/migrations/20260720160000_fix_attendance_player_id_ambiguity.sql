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

REVOKE ALL ON FUNCTION public.set_calendar_event_attendance(UUID, TEXT, DATE, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_calendar_event_attendance(UUID, TEXT, DATE, UUID, TEXT) TO authenticated;
