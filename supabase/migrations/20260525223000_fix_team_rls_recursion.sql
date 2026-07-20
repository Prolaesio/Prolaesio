-- Migration: Fix recursive RLS between teams and team_memberships
-- Date: 2026-05-25
--
-- Root cause:
--   teams SELECT policy referenced team_memberships,
--   while team_memberships SELECT policy referenced teams.
--   This creates a circular RLS dependency and can raise:
--   "infinite recursion detected in policy for relation \"teams\"".
--
-- Fix:
--   move cross-table checks into SECURITY DEFINER helper functions
--   and rebuild policies to use those helpers.

CREATE OR REPLACE FUNCTION public.is_team_creator(
  p_team_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.teams t
    WHERE t.id = p_team_id
      AND t.created_by = p_user_id
  );
$$;
CREATE OR REPLACE FUNCTION public.is_active_team_member(
  p_team_id UUID,
  p_user_id UUID DEFAULT auth.uid()
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
      AND tm.user_id = p_user_id
      AND tm.status = 'active'
  );
$$;
CREATE OR REPLACE FUNCTION public.is_active_team_coach(
  p_team_id UUID,
  p_user_id UUID DEFAULT auth.uid()
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
      AND tm.user_id = p_user_id
      AND tm.role = 'coach'
      AND tm.status = 'active'
  );
$$;
CREATE OR REPLACE FUNCTION public.can_manage_team(
  p_team_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_team_creator(p_team_id, p_user_id)
      OR public.is_active_team_coach(p_team_id, p_user_id);
$$;
GRANT EXECUTE ON FUNCTION public.is_team_creator(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_team_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_team_coach(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_team(UUID, UUID) TO authenticated;
DROP POLICY IF EXISTS "Teams are visible to related members" ON public.teams;
CREATE POLICY "Teams are visible to related members"
  ON public.teams
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = created_by
    OR public.is_active_team_member(teams.id, auth.uid())
  );
DROP POLICY IF EXISTS "Coach members can update teams" ON public.teams;
CREATE POLICY "Coach members can update teams"
  ON public.teams
  FOR UPDATE
  TO authenticated
  USING (public.can_manage_team(teams.id, auth.uid()))
  WITH CHECK (public.can_manage_team(teams.id, auth.uid()));
DROP POLICY IF EXISTS "Memberships are visible to related users" ON public.team_memberships;
CREATE POLICY "Memberships are visible to related users"
  ON public.team_memberships
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.can_manage_team(team_memberships.team_id, auth.uid())
  );
DROP POLICY IF EXISTS "Coaches can create memberships" ON public.team_memberships;
CREATE POLICY "Coaches can create memberships"
  ON public.team_memberships
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_team(team_memberships.team_id, auth.uid()));
DROP POLICY IF EXISTS "Coaches can update memberships" ON public.team_memberships;
CREATE POLICY "Coaches can update memberships"
  ON public.team_memberships
  FOR UPDATE
  TO authenticated
  USING (public.can_manage_team(team_memberships.team_id, auth.uid()))
  WITH CHECK (public.can_manage_team(team_memberships.team_id, auth.uid()));
DROP POLICY IF EXISTS "Coaches can delete memberships" ON public.team_memberships;
CREATE POLICY "Coaches can delete memberships"
  ON public.team_memberships
  FOR DELETE
  TO authenticated
  USING (public.can_manage_team(team_memberships.team_id, auth.uid()));
