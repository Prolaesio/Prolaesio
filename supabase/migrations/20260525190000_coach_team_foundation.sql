-- Migration: Coach Team Foundation
-- Date: 2026-05-25
--
-- Adds the first Supabase-backed team model:
--   * teams: coach-managed team records with invite codes
--   * team_memberships: membership rows for coaches/players
--
-- Notes:
--   * Existing tables are left untouched.
--   * DDL is idempotent where possible (IF NOT EXISTS / guarded policy creation).

CREATE TABLE IF NOT EXISTS public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS teams_created_by_idx
  ON public.teams (created_by);
CREATE TABLE IF NOT EXISTS public.team_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('coach', 'player')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'removed')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(team_id, user_id)
);
CREATE INDEX IF NOT EXISTS team_memberships_user_id_idx
  ON public.team_memberships (user_id);
CREATE INDEX IF NOT EXISTS team_memberships_team_id_idx
  ON public.team_memberships (team_id);
CREATE INDEX IF NOT EXISTS team_memberships_team_status_idx
  ON public.team_memberships (team_id, status);
-- Keep updated_at in sync with existing trigger function.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'handle_updated_at'
      AND pg_function_is_visible(oid)
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'set_updated_at_teams'
    ) THEN
      CREATE TRIGGER set_updated_at_teams
        BEFORE UPDATE ON public.teams
        FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'set_updated_at_team_memberships'
    ) THEN
      CREATE TRIGGER set_updated_at_team_memberships
        BEFORE UPDATE ON public.team_memberships
        FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
    END IF;
  END IF;
END;
$$;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_memberships ENABLE ROW LEVEL SECURITY;
-- Teams: only visible/manageable by related users.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'teams'
      AND policyname = 'Teams are visible to related members'
  ) THEN
    CREATE POLICY "Teams are visible to related members"
      ON public.teams
      FOR SELECT
      TO authenticated
      USING (
        auth.uid() = created_by
        OR EXISTS (
          SELECT 1
          FROM public.team_memberships tm
          WHERE tm.team_id = teams.id
            AND tm.user_id = auth.uid()
            AND tm.status = 'active'
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
      AND tablename = 'teams'
      AND policyname = 'Coaches can create teams'
  ) THEN
    CREATE POLICY "Coaches can create teams"
      ON public.teams
      FOR INSERT
      TO authenticated
      WITH CHECK (
        auth.uid() = created_by
        AND EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.role = 'coach'
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
      AND tablename = 'teams'
      AND policyname = 'Coach members can update teams'
  ) THEN
    CREATE POLICY "Coach members can update teams"
      ON public.teams
      FOR UPDATE
      TO authenticated
      USING (
        auth.uid() = created_by
        OR EXISTS (
          SELECT 1
          FROM public.team_memberships tm
          WHERE tm.team_id = teams.id
            AND tm.user_id = auth.uid()
            AND tm.role = 'coach'
            AND tm.status = 'active'
        )
      )
      WITH CHECK (
        auth.uid() = created_by
        OR EXISTS (
          SELECT 1
          FROM public.team_memberships tm
          WHERE tm.team_id = teams.id
            AND tm.user_id = auth.uid()
            AND tm.role = 'coach'
            AND tm.status = 'active'
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
      AND tablename = 'teams'
      AND policyname = 'Team creators can delete teams'
  ) THEN
    CREATE POLICY "Team creators can delete teams"
      ON public.teams
      FOR DELETE
      TO authenticated
      USING (auth.uid() = created_by);
  END IF;
END;
$$;
-- Team memberships: visible to the member and team coaches/creator.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'team_memberships'
      AND policyname = 'Memberships are visible to related users'
  ) THEN
    CREATE POLICY "Memberships are visible to related users"
      ON public.team_memberships
      FOR SELECT
      TO authenticated
      USING (
        auth.uid() = user_id
        OR EXISTS (
          SELECT 1
          FROM public.teams t
          WHERE t.id = team_memberships.team_id
            AND t.created_by = auth.uid()
        )
        OR EXISTS (
          SELECT 1
          FROM public.team_memberships my_tm
          WHERE my_tm.team_id = team_memberships.team_id
            AND my_tm.user_id = auth.uid()
            AND my_tm.role = 'coach'
            AND my_tm.status = 'active'
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
      AND tablename = 'team_memberships'
      AND policyname = 'Coaches can create memberships'
  ) THEN
    CREATE POLICY "Coaches can create memberships"
      ON public.team_memberships
      FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.teams t
          WHERE t.id = team_memberships.team_id
            AND (
              t.created_by = auth.uid()
              OR EXISTS (
                SELECT 1
                FROM public.team_memberships my_tm
                WHERE my_tm.team_id = team_memberships.team_id
                  AND my_tm.user_id = auth.uid()
                  AND my_tm.role = 'coach'
                  AND my_tm.status = 'active'
              )
            )
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
      AND tablename = 'team_memberships'
      AND policyname = 'Coaches can update memberships'
  ) THEN
    CREATE POLICY "Coaches can update memberships"
      ON public.team_memberships
      FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.teams t
          WHERE t.id = team_memberships.team_id
            AND (
              t.created_by = auth.uid()
              OR EXISTS (
                SELECT 1
                FROM public.team_memberships my_tm
                WHERE my_tm.team_id = team_memberships.team_id
                  AND my_tm.user_id = auth.uid()
                  AND my_tm.role = 'coach'
                  AND my_tm.status = 'active'
              )
            )
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.teams t
          WHERE t.id = team_memberships.team_id
            AND (
              t.created_by = auth.uid()
              OR EXISTS (
                SELECT 1
                FROM public.team_memberships my_tm
                WHERE my_tm.team_id = team_memberships.team_id
                  AND my_tm.user_id = auth.uid()
                  AND my_tm.role = 'coach'
                  AND my_tm.status = 'active'
              )
            )
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
      AND tablename = 'team_memberships'
      AND policyname = 'Coaches can delete memberships'
  ) THEN
    CREATE POLICY "Coaches can delete memberships"
      ON public.team_memberships
      FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.teams t
          WHERE t.id = team_memberships.team_id
            AND (
              t.created_by = auth.uid()
              OR EXISTS (
                SELECT 1
                FROM public.team_memberships my_tm
                WHERE my_tm.team_id = team_memberships.team_id
                  AND my_tm.user_id = auth.uid()
                  AND my_tm.role = 'coach'
                  AND my_tm.status = 'active'
              )
            )
        )
      );
  END IF;
END;
$$;
