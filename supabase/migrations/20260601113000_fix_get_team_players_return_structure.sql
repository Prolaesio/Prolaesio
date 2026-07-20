-- Migration: Fix get_team_players return structure/type alignment
-- Date: 2026-06-01
--
-- Resolves Postgres error:
--   "structure of query does not match function result type"
-- by explicitly casting each returned column to the declared RETURNS TABLE
-- shape, preserving order and types.

DROP FUNCTION IF EXISTS public.get_team_players(UUID);
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
      nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
      split_part(coalesce(u.email::TEXT, ''::TEXT), '@'::TEXT, 1),
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
REVOKE ALL ON FUNCTION public.get_team_players(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_team_players(UUID) TO authenticated;
