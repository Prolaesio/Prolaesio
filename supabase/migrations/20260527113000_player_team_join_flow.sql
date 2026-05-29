-- Migration: Player team-code join flow + coach player visibility helpers
-- Date: 2026-05-27
--
-- Adds:
-- 1) join_team_by_invite_code() RPC for authenticated players to join teams
--    by invite code without weakening table-wide RLS.
-- 2) get_team_players() RPC for coaches to fetch real player identities for a
--    selected managed team.

CREATE OR REPLACE FUNCTION public.join_team_by_invite_code(
  p_invite_code TEXT
)
RETURNS TABLE (
  team_id UUID,
  team_name TEXT,
  invite_code TEXT,
  status TEXT,
  message TEXT
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_code TEXT;
  active_user_id UUID;
  target_team public.teams%ROWTYPE;
  existing_membership public.team_memberships%ROWTYPE;
BEGIN
  active_user_id := auth.uid();

  IF active_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized to join this team.' USING ERRCODE = '42501';
  END IF;

  normalized_code := upper(trim(coalesce(p_invite_code, '')));

  IF normalized_code = '' THEN
    RETURN QUERY
    SELECT
      NULL::UUID,
      NULL::TEXT,
      NULL::TEXT,
      'invalid_code'::TEXT,
      'Please enter a valid team code.'::TEXT;
    RETURN;
  END IF;

  SELECT t.*
  INTO target_team
  FROM public.teams t
  WHERE upper(t.invite_code) = normalized_code
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      NULL::UUID,
      NULL::TEXT,
      normalized_code,
      'invalid_code'::TEXT,
      'That team code does not match any team.'::TEXT;
    RETURN;
  END IF;

  SELECT tm.*
  INTO existing_membership
  FROM public.team_memberships tm
  WHERE tm.team_id = target_team.id
    AND tm.user_id = active_user_id
  LIMIT 1;

  IF FOUND THEN
    IF existing_membership.role = 'coach' THEN
      RETURN QUERY
      SELECT
        target_team.id,
        target_team.name,
        target_team.invite_code,
        'already_member'::TEXT,
        'You are already connected to this team.'::TEXT;
      RETURN;
    END IF;

    IF existing_membership.status = 'active' THEN
      RETURN QUERY
      SELECT
        target_team.id,
        target_team.name,
        target_team.invite_code,
        'already_member'::TEXT,
        'You are already in this team.'::TEXT;
      RETURN;
    END IF;

    UPDATE public.team_memberships
    SET
      status = 'active',
      role = 'player',
      joined_at = now(),
      updated_at = now()
    WHERE id = existing_membership.id;
  ELSE
    INSERT INTO public.team_memberships (team_id, user_id, role, status)
    VALUES (target_team.id, active_user_id, 'player', 'active');
  END IF;

  UPDATE public.profiles
  SET team_code = target_team.invite_code
  WHERE id = active_user_id;

  RETURN QUERY
  SELECT
    target_team.id,
    target_team.name,
    target_team.invite_code,
    'joined'::TEXT,
    'Team joined successfully.'::TEXT;
END;
$$;

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
    tm.user_id,
    coalesce(
      nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
      split_part(coalesce(u.email, ''), '@', 1),
      concat('Player ', left(tm.user_id::text, 8))
    ) AS display_name,
    u.email,
    p.age,
    p.height_cm,
    p.weight_kg,
    coalesce(p.positions, '{}'::TEXT[]),
    tm.joined_at
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

REVOKE ALL ON FUNCTION public.join_team_by_invite_code(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_team_players(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_team_by_invite_code(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_players(UUID) TO authenticated;
