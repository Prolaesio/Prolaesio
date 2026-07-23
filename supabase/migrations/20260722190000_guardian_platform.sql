-- Guardian platform foundation.
-- Guardian onboarding, invitations, verification, and consent capture are intentionally deferred.

-- Extend the existing single-role account model without changing existing player/coach rows.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('player', 'coach', 'guardian'));

-- Once selected, account roles cannot be changed by an authenticated browser client.
-- Administrative/local seed operations run without auth.uid() and remain possible.
CREATE OR REPLACE FUNCTION public.protect_account_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND OLD.role IS NOT NULL
     AND NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Account roles cannot be changed from the client.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_account_role_on_profiles ON public.profiles;
CREATE TRIGGER protect_account_role_on_profiles
  BEFORE UPDATE OF role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_account_role();

CREATE TABLE IF NOT EXISTS public.guardian_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  phone_number TEXT,
  avatar_url TEXT,
  preferred_language TEXT NOT NULL DEFAULT 'en',
  time_zone TEXT NOT NULL DEFAULT 'Europe/Lisbon',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (display_name IS NULL OR char_length(btrim(display_name)) BETWEEN 1 AND 80),
  CHECK (phone_number IS NULL OR char_length(phone_number) <= 40),
  CHECK (char_length(preferred_language) BETWEEN 2 AND 16),
  CHECK (char_length(time_zone) BETWEEN 1 AND 80)
);

CREATE TABLE IF NOT EXISTS public.guardian_player_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guardian_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL CHECK (relationship_type IN ('parent', 'legal_guardian', 'authorised_guardian')),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('active', 'pending', 'revoked', 'removed')),
  access_level TEXT NOT NULL DEFAULT 'standard' CHECK (access_level IN ('limited', 'standard', 'enhanced', 'custom')),
  relationship_start_date DATE,
  relationship_end_date DATE,
  linked_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  removed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  consent_status TEXT NOT NULL DEFAULT 'not_required'
    CHECK (consent_status IN ('not_required', 'required', 'pending', 'granted', 'rejected', 'withdrawn')),
  consent_version TEXT,
  consented_at TIMESTAMPTZ,
  consent_legal_text_version TEXT,
  verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'pending', 'verified', 'rejected', 'expired')),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (guardian_user_id <> player_user_id),
  CHECK (relationship_end_date IS NULL OR relationship_start_date IS NULL OR relationship_end_date >= relationship_start_date)
);

CREATE UNIQUE INDEX IF NOT EXISTS guardian_relationship_one_active_pair_idx
  ON public.guardian_player_relationships (guardian_user_id, player_user_id)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS guardian_relationship_guardian_idx
  ON public.guardian_player_relationships (guardian_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS guardian_relationship_player_idx
  ON public.guardian_player_relationships (player_user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.guardian_permission_definitions (
  permission_key TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  default_state TEXT NOT NULL CHECK (default_state IN ('allowed', 'not_allowed', 'pending', 'revoked', 'required')),
  default_controlled_by TEXT NOT NULL CHECK (default_controlled_by IN ('platform', 'player', 'guardian', 'club')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.guardian_relationship_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  relationship_id UUID NOT NULL REFERENCES public.guardian_player_relationships(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES public.guardian_permission_definitions(permission_key) ON DELETE RESTRICT,
  state TEXT NOT NULL CHECK (state IN ('allowed', 'not_allowed', 'pending', 'revoked', 'required')),
  controlled_by TEXT NOT NULL CHECK (controlled_by IN ('platform', 'player', 'guardian', 'club')),
  granted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (relationship_id, permission_key)
);

INSERT INTO public.guardian_permission_definitions
  (permission_key, category, label, description, default_state, default_controlled_by, sort_order)
VALUES
  ('calendar', 'Schedule', 'Calendar', 'Team and permitted individual events.', 'allowed', 'platform', 10),
  ('attendance', 'Schedule', 'Attendance', 'Recorded attendance for the linked player.', 'allowed', 'platform', 20),
  ('rsvp', 'Schedule', 'RSVP', 'The player RSVP state. Guardian access is read-only.', 'allowed', 'platform', 30),
  ('training_completion', 'Training', 'Training completion', 'Whether recent training logs were completed.', 'allowed', 'platform', 40),
  ('wellness_completion', 'Wellness', 'Wellness completion', 'Whether recent wellness check-ins were completed.', 'allowed', 'platform', 50),
  ('readiness_category', 'Readiness', 'Readiness category', 'A general non-diagnostic readiness category.', 'allowed', 'platform', 60),
  ('readiness_score', 'Readiness', 'Readiness score', 'The calculated readiness score without raw answers.', 'not_allowed', 'player', 70),
  ('general_wellness_summary', 'Wellness', 'General wellness summary', 'A limited summary without private answers or notes.', 'not_allowed', 'player', 80),
  ('training_summary', 'Training', 'Training summary', 'Recent session type, duration, and general intensity.', 'allowed', 'platform', 90),
  ('training_load', 'Training', 'Training load', 'General weekly load trend and caution category.', 'not_allowed', 'player', 100),
  ('injury_alerts', 'Safety', 'Injury alerts', 'General active injury and safety flags.', 'allowed', 'platform', 110),
  ('pain_severity', 'Safety', 'Pain severity', 'General pain severity category.', 'not_allowed', 'player', 120),
  ('pain_location', 'Safety', 'Pain location', 'Guardian-visible general body area.', 'not_allowed', 'player', 130),
  ('coach_announcements', 'Communication', 'Coach announcements', 'Announcements addressed to Guardians.', 'allowed', 'club', 140),
  ('player_profile_basics', 'Profile', 'Player profile basics', 'Name, team, and position.', 'required', 'platform', 150),
  ('individual_sessions', 'Schedule', 'Individual session details', 'Personal session details approved for Guardian view.', 'not_allowed', 'player', 160),
  ('guardian_visible_documents', 'Documents', 'Guardian-visible documents', 'Documents explicitly shared with Guardians.', 'not_allowed', 'club', 170),
  ('billing', 'Account', 'Billing', 'Billing details associated with the linked player.', 'not_allowed', 'club', 180),
  ('privacy_requests', 'Account', 'Privacy requests', 'Submit future privacy and account requests.', 'allowed', 'guardian', 190)
ON CONFLICT (permission_key) DO UPDATE SET
  category = EXCLUDED.category,
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  default_state = EXCLUDED.default_state,
  default_controlled_by = EXCLUDED.default_controlled_by,
  sort_order = EXCLUDED.sort_order;

CREATE TABLE IF NOT EXISTS public.guardian_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guardian_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  update_type TEXT NOT NULL CHECK (update_type IN (
    'coach_announcement', 'team_announcement', 'schedule_update', 'event_cancellation',
    'attendance_concern', 'safety_alert', 'permission_update', 'relationship_update', 'account_notice'
  )),
  audience TEXT NOT NULL DEFAULT 'guardians' CHECK (audience IN ('players', 'guardians', 'players_and_guardians')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  related_player_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  related_team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  related_event_id UUID REFERENCES public.calendar_events(id) ON DELETE SET NULL,
  importance TEXT NOT NULL DEFAULT 'information' CHECK (importance IN ('information', 'attention', 'important', 'urgent')),
  guardian_visible BOOLEAN NOT NULL DEFAULT TRUE,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  acknowledgement_required BOOLEAN NOT NULL DEFAULT FALSE,
  acknowledged_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS guardian_updates_recipient_idx
  ON public.guardian_updates (guardian_user_id, is_read, created_at DESC);

CREATE TABLE IF NOT EXISTS public.guardian_acknowledgements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  update_id UUID NOT NULL REFERENCES public.guardian_updates(id) ON DELETE CASCADE,
  guardian_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  UNIQUE (update_id, guardian_user_id)
);

CREATE TABLE IF NOT EXISTS public.guardian_notification_preferences (
  guardian_user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  in_app JSONB NOT NULL DEFAULT '{"schedule_changes":true,"event_cancellations":true,"attendance_updates":true,"rsvp_reminders":true,"coach_announcements":true,"injury_alerts":true,"high_pain_alerts":true,"readiness_safety_alerts":true,"permission_changes":true,"relationship_changes":true,"product_updates":true}'::JSONB,
  email JSONB NOT NULL DEFAULT '{}'::JSONB,
  push JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Existing data can explicitly opt descriptions/body areas into Guardian view.
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS guardian_visible BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS guardian_description TEXT,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS guardian_location TEXT;
ALTER TABLE public.injuries
  ADD COLUMN IF NOT EXISTS guardian_visible BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS guardian_body_area TEXT,
  ADD COLUMN IF NOT EXISTS professional_attention_suggested BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'guardian_profiles', 'guardian_player_relationships', 'guardian_relationship_permissions',
    'guardian_updates', 'guardian_notification_preferences'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_' || table_name) THEN
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at()',
        'set_updated_at_' || table_name,
        table_name
      );
    END IF;
  END LOOP;
END;
$$;

ALTER TABLE public.guardian_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardian_player_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardian_permission_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardian_relationship_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardian_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardian_acknowledgements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardian_notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_guardian(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = p_user_id AND p.role = 'guardian'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_guardian_relationship(
  p_player_id UUID,
  p_guardian_id UUID DEFAULT auth.uid(),
  p_require_active BOOLEAN DEFAULT TRUE
)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT r.id
  FROM public.guardian_player_relationships r
  WHERE r.guardian_user_id = p_guardian_id
    AND r.player_user_id = p_player_id
    AND (NOT p_require_active OR r.status IN ('active','adult_authorised'))
  ORDER BY (r.status IN ('active','adult_authorised')) DESC, r.created_at DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.guardian_has_permission(
  p_player_id UUID,
  p_permission_key TEXT,
  p_guardian_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_guardian(p_guardian_id)
    AND EXISTS (
      SELECT 1
      FROM public.guardian_player_relationships r
      JOIN public.guardian_permission_definitions d ON d.permission_key = p_permission_key
      LEFT JOIN public.guardian_relationship_permissions rp
        ON rp.relationship_id = r.id AND rp.permission_key = d.permission_key
      WHERE r.guardian_user_id = p_guardian_id
        AND r.player_user_id = p_player_id
        AND r.status IN ('active','adult_authorised')
        AND coalesce(rp.state, d.default_state) IN ('allowed', 'required')
    );
$$;

-- RLS for Guardian-owned and relationship-scoped tables. Permission mutations remain backend-only.
DROP POLICY IF EXISTS "Guardians can view own guardian profile" ON public.guardian_profiles;
CREATE POLICY "Guardians can view own guardian profile" ON public.guardian_profiles
  FOR SELECT TO authenticated USING (auth.uid() = user_id AND public.is_guardian(auth.uid()));
DROP POLICY IF EXISTS "Guardians can insert own guardian profile" ON public.guardian_profiles;
CREATE POLICY "Guardians can insert own guardian profile" ON public.guardian_profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND public.is_guardian(auth.uid()));
DROP POLICY IF EXISTS "Guardians can update own guardian profile" ON public.guardian_profiles;
CREATE POLICY "Guardians can update own guardian profile" ON public.guardian_profiles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id AND public.is_guardian(auth.uid()))
  WITH CHECK (auth.uid() = user_id AND public.is_guardian(auth.uid()));

DROP POLICY IF EXISTS "Guardians can view own relationships" ON public.guardian_player_relationships;
CREATE POLICY "Guardians can view own relationships" ON public.guardian_player_relationships
  FOR SELECT TO authenticated USING (auth.uid() = guardian_user_id AND public.is_guardian(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view permission definitions" ON public.guardian_permission_definitions;
CREATE POLICY "Authenticated users can view permission definitions" ON public.guardian_permission_definitions
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Guardians can view own relationship permissions" ON public.guardian_relationship_permissions;
CREATE POLICY "Guardians can view own relationship permissions" ON public.guardian_relationship_permissions
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.guardian_player_relationships r
      WHERE r.id = guardian_relationship_permissions.relationship_id
        AND r.guardian_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Guardians can view addressed updates" ON public.guardian_updates;
CREATE POLICY "Guardians can view addressed updates" ON public.guardian_updates
  FOR SELECT TO authenticated USING (
    guardian_user_id = auth.uid() AND guardian_visible AND public.is_guardian(auth.uid())
  );

DROP POLICY IF EXISTS "Guardians can view own acknowledgements" ON public.guardian_acknowledgements;
CREATE POLICY "Guardians can view own acknowledgements" ON public.guardian_acknowledgements
  FOR SELECT TO authenticated USING (guardian_user_id = auth.uid() AND public.is_guardian(auth.uid()));

DROP POLICY IF EXISTS "Guardians can view own notification preferences" ON public.guardian_notification_preferences;
CREATE POLICY "Guardians can view own notification preferences" ON public.guardian_notification_preferences
  FOR SELECT TO authenticated USING (guardian_user_id = auth.uid() AND public.is_guardian(auth.uid()));
DROP POLICY IF EXISTS "Guardians can insert own notification preferences" ON public.guardian_notification_preferences;
CREATE POLICY "Guardians can insert own notification preferences" ON public.guardian_notification_preferences
  FOR INSERT TO authenticated WITH CHECK (guardian_user_id = auth.uid() AND public.is_guardian(auth.uid()));
DROP POLICY IF EXISTS "Guardians can update own notification preferences" ON public.guardian_notification_preferences;
CREATE POLICY "Guardians can update own notification preferences" ON public.guardian_notification_preferences
  FOR UPDATE TO authenticated USING (guardian_user_id = auth.uid() AND public.is_guardian(auth.uid()))
  WITH CHECK (guardian_user_id = auth.uid() AND public.is_guardian(auth.uid()));

-- Sanitized linked-player list. No email, DOB, wellness answers, notes, or coach-private fields are returned.
CREATE OR REPLACE FUNCTION public.guardian_get_linked_players()
RETURNS TABLE (
  relationship_id UUID, player_id UUID, player_name TEXT, positions TEXT[], team_id UUID,
  team_name TEXT, coach_or_club TEXT, relationship_type TEXT, is_primary BOOLEAN,
  relationship_status TEXT, access_level TEXT, linked_at TIMESTAMPTZ,
  wellness_completed_today BOOLEAN, training_completed_today BOOLEAN,
  readiness_category TEXT, active_safety_flag BOOLEAN, upcoming_event_title TEXT,
  upcoming_event_time TEXT, attendance_summary TEXT, last_meaningful_update TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_guardian(auth.uid()) THEN
    RAISE EXCEPTION 'Guardian account required.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    r.id,
    r.player_user_id,
    coalesce(nullif(btrim(p.display_name), ''), 'Linked player')::TEXT,
    CASE WHEN r.status IN ('active','adult_authorised') THEN coalesce(p.positions, '{}'::TEXT[]) ELSE '{}'::TEXT[] END,
    team_data.team_id,
    team_data.team_name,
    team_data.team_name,
    r.relationship_type,
    r.is_primary,
    r.status,
    r.access_level,
    r.linked_at,
    CASE WHEN r.status IN ('active','adult_authorised') AND public.guardian_has_permission(r.player_user_id, 'wellness_completion')
      THEN EXISTS (SELECT 1 FROM public.wellness_logs w WHERE w.user_id = r.player_user_id AND w.date = current_date)
      ELSE FALSE END,
    CASE WHEN r.status IN ('active','adult_authorised') AND public.guardian_has_permission(r.player_user_id, 'training_completion')
      THEN EXISTS (SELECT 1 FROM public.training_logs tr WHERE tr.user_id = r.player_user_id AND tr.date = current_date)
      ELSE FALSE END,
    CASE
      WHEN r.status NOT IN ('active','adult_authorised') OR NOT public.guardian_has_permission(r.player_user_id, 'readiness_category') THEN 'Not available'
      WHEN latest_wellness.date IS NULL THEN 'No recent data'
      WHEN coalesce(latest_wellness.pain_level, 0) >= 8 THEN 'Safety attention required'
      WHEN ((latest_wellness.energy + (11 - latest_wellness.fatigue) + (11 - latest_wellness.stress) + latest_wellness.sleep_quality) * 2.5) >= 80 THEN 'Ready'
      WHEN ((latest_wellness.energy + (11 - latest_wellness.fatigue) + (11 - latest_wellness.stress) + latest_wellness.sleep_quality) * 2.5) >= 60 THEN 'Moderate caution'
      WHEN ((latest_wellness.energy + (11 - latest_wellness.fatigue) + (11 - latest_wellness.stress) + latest_wellness.sleep_quality) * 2.5) >= 40 THEN 'Reduced readiness'
      ELSE 'Recovery recommended'
    END::TEXT,
    CASE WHEN r.status IN ('active','adult_authorised') AND public.guardian_has_permission(r.player_user_id, 'injury_alerts')
      THEN EXISTS (
        SELECT 1 FROM public.injuries i WHERE i.user_id = r.player_user_id AND i.status IN ('active', 'recovering')
        UNION ALL
        SELECT 1 FROM public.wellness_logs w WHERE w.user_id = r.player_user_id AND w.date >= current_date - 7 AND coalesce(w.pain_level, 0) >= 8
      ) ELSE FALSE END,
    CASE WHEN r.status IN ('active','adult_authorised') AND public.guardian_has_permission(r.player_user_id, 'calendar') THEN upcoming.title ELSE NULL END,
    CASE WHEN r.status IN ('active','adult_authorised') AND public.guardian_has_permission(r.player_user_id, 'calendar') THEN upcoming.start_time ELSE NULL END,
    CASE WHEN r.status IN ('active','adult_authorised') AND public.guardian_has_permission(r.player_user_id, 'attendance')
      THEN coalesce(attendance.summary, 'No attendance recorded') ELSE 'Not available' END::TEXT,
    CASE WHEN r.status IN ('active','adult_authorised') THEN greatest(r.updated_at, latest_wellness.created_at, latest_training.created_at, upcoming.created_at) ELSE r.updated_at END
  FROM public.guardian_player_relationships r
  LEFT JOIN public.profiles p ON p.id = r.player_user_id
  LEFT JOIN LATERAL (
    SELECT t.id AS team_id, t.name AS team_name
    FROM public.team_memberships tm JOIN public.teams t ON t.id = tm.team_id
    WHERE r.status IN ('active','adult_authorised') AND tm.user_id = r.player_user_id AND tm.role = 'player' AND tm.status = 'active'
    ORDER BY tm.joined_at DESC LIMIT 1
  ) team_data ON TRUE
  LEFT JOIN LATERAL (
    SELECT w.date, w.energy, w.fatigue, w.stress, w.sleep_quality, w.pain_level, w.created_at
    FROM public.wellness_logs w WHERE r.status IN ('active','adult_authorised') AND w.user_id = r.player_user_id ORDER BY w.date DESC LIMIT 1
  ) latest_wellness ON TRUE
  LEFT JOIN LATERAL (
    SELECT tr.created_at FROM public.training_logs tr WHERE r.status IN ('active','adult_authorised') AND tr.user_id = r.player_user_id ORDER BY tr.date DESC LIMIT 1
  ) latest_training ON TRUE
  LEFT JOIN LATERAL (
    SELECT coalesce(nullif(ce.title, ''), 'Scheduled activity')::TEXT AS title, ce.start_time, ce.created_at
    FROM public.calendar_events ce
    WHERE r.status IN ('active','adult_authorised') AND ce.user_id = r.player_user_id
      AND split_part(ce.start_time, 'T', 1)::DATE >= current_date
      AND (ce.guardian_visible OR coalesce(ce.recurrence_config -> 'meta' ->> 'coachManaged', 'false') = 'true')
    ORDER BY ce.start_time ASC LIMIT 1
  ) upcoming ON TRUE
  LEFT JOIN LATERAL (
    SELECT concat(
      count(*) FILTER (WHERE cea.attendance_status = 'did'), ' attended · ',
      count(*) FILTER (WHERE cea.attendance_status = 'did_not'), ' missed'
    )::TEXT AS summary
    FROM public.calendar_event_attendance cea
    WHERE cea.player_id = r.player_user_id AND cea.occurrence_date >= current_date - 30
  ) attendance ON TRUE
  WHERE r.guardian_user_id = auth.uid()
  ORDER BY (r.status IN ('active','adult_authorised')) DESC, r.is_primary DESC, r.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.guardian_get_player_overview(p_player_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE rel public.guardian_player_relationships%ROWTYPE;
DECLARE result JSONB;
BEGIN
  IF NOT public.is_guardian(auth.uid()) THEN
    RAISE EXCEPTION 'Guardian account required.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO rel FROM public.guardian_player_relationships r
  WHERE r.guardian_user_id = auth.uid() AND r.player_user_id = p_player_id
  ORDER BY (r.status IN ('active','adult_authorised')) DESC, r.created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Linked player not found.' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'player', jsonb_build_object(
      'id', p_player_id,
      'name', coalesce(nullif(btrim(p.display_name), ''), 'Linked player'),
      'positions', CASE WHEN rel.status IN ('active','adult_authorised') THEN coalesce(p.positions, '{}'::TEXT[]) ELSE '{}'::TEXT[] END,
      'teamId', team_data.team_id,
      'teamName', team_data.team_name,
      'coachOrClub', team_data.team_name
    ),
    'relationship', jsonb_build_object(
      'id', rel.id, 'type', rel.relationship_type, 'isPrimary', rel.is_primary,
      'status', rel.status, 'accessLevel', rel.access_level, 'linkedAt', rel.linked_at
    ),
    'readiness', CASE WHEN rel.status IN ('active','adult_authorised') AND public.guardian_has_permission(p_player_id, 'readiness_category') THEN
      coalesce((
        SELECT jsonb_build_object(
          'category', CASE
            WHEN coalesce(w.pain_level, 0) >= 8 THEN 'Safety attention required'
            WHEN ((w.energy + (11-w.fatigue) + (11-w.stress) + w.sleep_quality) * 2.5) >= 80 THEN 'Ready'
            WHEN ((w.energy + (11-w.fatigue) + (11-w.stress) + w.sleep_quality) * 2.5) >= 60 THEN 'Moderate caution'
            WHEN ((w.energy + (11-w.fatigue) + (11-w.stress) + w.sleep_quality) * 2.5) >= 40 THEN 'Reduced readiness'
            ELSE 'Recovery recommended' END,
          'score', CASE WHEN public.guardian_has_permission(p_player_id, 'readiness_score')
            THEN round((w.energy + (11-w.fatigue) + (11-w.stress) + w.sleep_quality) * 2.5) ELSE NULL END,
          'recommendation', CASE WHEN coalesce(w.pain_level, 0) >= 8 THEN 'Review the latest safety information.'
            WHEN w.fatigue >= 8 THEN 'Recovery and a lighter workload may be appropriate.'
            ELSE 'Follow the player and coach plan for today.' END,
          'latestWellnessDate', w.date
        ) FROM public.wellness_logs w WHERE w.user_id = p_player_id ORDER BY w.date DESC LIMIT 1
      ), jsonb_build_object('category', 'No recent data', 'score', NULL, 'recommendation', 'A completed wellness check-in is needed.', 'latestWellnessDate', NULL))
      ELSE NULL END,
    'wellness', CASE WHEN rel.status IN ('active','adult_authorised') AND public.guardian_has_permission(p_player_id, 'wellness_completion') THEN
      jsonb_build_object(
        'completedToday', EXISTS (SELECT 1 FROM public.wellness_logs w WHERE w.user_id = p_player_id AND w.date = current_date),
        'completedLast7Days', (SELECT count(*) FROM public.wellness_logs w WHERE w.user_id = p_player_id AND w.date BETWEEN current_date - 6 AND current_date),
        'safetyThresholdTriggered', EXISTS (SELECT 1 FROM public.wellness_logs w WHERE w.user_id = p_player_id AND w.date >= current_date - 7 AND coalesce(w.pain_level,0) >= 8),
        'summary', CASE WHEN public.guardian_has_permission(p_player_id, 'general_wellness_summary')
          THEN 'A limited wellness summary is available. Private answers and notes remain hidden.' ELSE NULL END
      ) ELSE NULL END,
    'training', CASE WHEN rel.status IN ('active','adult_authorised') AND public.guardian_has_permission(p_player_id, 'training_summary') THEN
      jsonb_build_object(
        'completedToday', EXISTS (SELECT 1 FROM public.training_logs tr WHERE tr.user_id = p_player_id AND tr.date = current_date),
        'sessionsLast7Days', (SELECT count(*) FROM public.training_logs tr WHERE tr.user_id = p_player_id AND tr.date BETWEEN current_date - 6 AND current_date),
        'minutesLast7Days', (SELECT coalesce(sum(tr.duration),0) FROM public.training_logs tr WHERE tr.user_id = p_player_id AND tr.date BETWEEN current_date - 6 AND current_date),
        'trend', CASE WHEN public.guardian_has_permission(p_player_id, 'training_load') THEN
          (SELECT CASE WHEN coalesce(sum(tr.duration * tr.intensity),0) >= 2400 THEN 'High — use caution'
            WHEN coalesce(sum(tr.duration * tr.intensity),0) >= 1200 THEN 'Moderate'
            ELSE 'Light' END FROM public.training_logs tr WHERE tr.user_id = p_player_id AND tr.date BETWEEN current_date - 6 AND current_date)
          ELSE 'Available with permission' END,
        'recentSessions', coalesce((SELECT jsonb_agg(jsonb_build_object(
          'date', s.date, 'sessionType', s.session_type, 'duration', s.duration,
          'intensity', CASE WHEN s.intensity >= 8 THEN 'High' WHEN s.intensity >= 5 THEN 'Moderate' ELSE 'Low' END
        ) ORDER BY s.date DESC) FROM (SELECT tr.date, tr.session_type, tr.duration, tr.intensity FROM public.training_logs tr WHERE tr.user_id = p_player_id ORDER BY tr.date DESC LIMIT 5) s), '[]'::JSONB)
      ) ELSE NULL END,
    'attendance', CASE WHEN rel.status IN ('active','adult_authorised') AND public.guardian_has_permission(p_player_id, 'attendance') THEN
      coalesce((SELECT jsonb_agg(jsonb_build_object(
        'date', a.occurrence_date, 'attendanceStatus', a.attendance_status, 'rsvpStatus',
        CASE WHEN public.guardian_has_permission(p_player_id, 'rsvp') THEN a.rsvp_status ELSE NULL END
      ) ORDER BY a.occurrence_date DESC) FROM (SELECT * FROM public.calendar_event_attendance cea WHERE cea.player_id = p_player_id ORDER BY cea.occurrence_date DESC LIMIT 10) a), '[]'::JSONB)
      ELSE NULL END,
    'safety', CASE WHEN rel.status IN ('active','adult_authorised') AND public.guardian_has_permission(p_player_id, 'injury_alerts') THEN
      coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', safety_item.id, 'status', safety_item.status, 'dateReported', safety_item.reported_at,
        'bodyArea', safety_item.body_area, 'severity', safety_item.severity,
        'recommendation', safety_item.recommendation,
        'professionalAttentionSuggested', safety_item.professional_attention_suggested
      ) ORDER BY safety_item.reported_at DESC)
      FROM (
        SELECT i.id, i.status::TEXT, i.created_at AS reported_at,
          CASE WHEN i.guardian_visible AND public.guardian_has_permission(p_player_id, 'pain_location') THEN i.guardian_body_area ELSE NULL END AS body_area,
          NULL::TEXT AS severity,
          CASE WHEN i.professional_attention_suggested THEN 'Professional medical attention has been suggested.' ELSE 'Follow the current coach and recovery guidance.' END::TEXT AS recommendation,
          i.professional_attention_suggested
        FROM public.injuries i WHERE i.user_id = p_player_id AND i.status IN ('active','recovering')
        UNION ALL
        SELECT w.id, 'attention'::TEXT, w.created_at, NULL::TEXT,
          CASE WHEN public.guardian_has_permission(p_player_id, 'pain_severity') THEN
            CASE WHEN coalesce(w.pain_level,0) >= 9 THEN 'Urgent' WHEN coalesce(w.pain_level,0) >= 8 THEN 'Important' ELSE 'Attention' END
            ELSE NULL END,
          'Review the latest safety information and seek qualified advice when appropriate.'::TEXT,
          (coalesce(w.pain_level,0) >= 9)
        FROM public.wellness_logs w
        WHERE w.user_id = p_player_id AND w.date >= current_date - 7 AND coalesce(w.pain_level,0) >= 8
      ) safety_item), '[]'::JSONB)
      ELSE NULL END
  ) INTO result
  FROM public.profiles p
  LEFT JOIN LATERAL (
    SELECT t.id AS team_id, t.name AS team_name
    FROM public.team_memberships tm JOIN public.teams t ON t.id = tm.team_id
    WHERE rel.status IN ('active','adult_authorised') AND tm.user_id = p_player_id AND tm.role = 'player' AND tm.status = 'active'
    ORDER BY tm.joined_at DESC LIMIT 1
  ) team_data ON TRUE
  WHERE p.id = p_player_id;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.guardian_get_events(p_from DATE, p_to DATE, p_player_id UUID DEFAULT NULL)
RETURNS TABLE (
  event_id UUID, player_id UUID, player_name TEXT, team_id UUID, team_name TEXT,
  event_date DATE, start_time TEXT, end_time TEXT, title TEXT, event_type_id TEXT,
  description TEXT, location TEXT, is_cancelled BOOLEAN, is_changed BOOLEAN, attendance_status TEXT, rsvp_status TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_guardian(auth.uid()) THEN RAISE EXCEPTION 'Guardian account required.' USING ERRCODE = '42501'; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 93 THEN
    RAISE EXCEPTION 'Invalid event date range.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (ce.id, r.player_user_id, dates.day)
    ce.id, r.player_user_id, coalesce(nullif(btrim(p.display_name), ''), 'Linked player')::TEXT,
    team_data.team_id, team_data.team_name, dates.day::DATE,
    ce.start_time, ce.end_time, coalesce(nullif(ce.title,''), 'Scheduled activity')::TEXT, ce.event_type_id,
    CASE WHEN ce.guardian_visible THEN coalesce(ce.guardian_description, ce.description) ELSE ce.guardian_description END,
    CASE WHEN ce.guardian_visible THEN coalesce(ce.guardian_location, ce.location) ELSE ce.guardian_location END,
    coalesce((ce.overrides -> dates.day::TEXT ->> 'cancelled')::BOOLEAN, FALSE),
    ce.overrides ? dates.day::TEXT,
    cea.attendance_status,
    CASE WHEN public.guardian_has_permission(r.player_user_id, 'rsvp') THEN cea.rsvp_status ELSE NULL END
  FROM public.guardian_player_relationships r
  JOIN public.profiles p ON p.id = r.player_user_id
  JOIN public.calendar_events ce ON ce.user_id = r.player_user_id
  JOIN LATERAL generate_series(p_from, p_to, interval '1 day') dates(day) ON
    public.calendar_event_occurs_on(ce.start_time, ce.recurrence, coalesce(ce.recurrence_config,'{}'::JSONB), ce.recurrence_end_date, coalesce(ce.excluded_dates,'[]'::JSONB), dates.day::DATE)
  LEFT JOIN LATERAL (
    SELECT t.id AS team_id, t.name AS team_name
    FROM public.team_memberships tm JOIN public.teams t ON t.id = tm.team_id
    WHERE tm.user_id = r.player_user_id AND tm.role = 'player' AND tm.status = 'active'
    ORDER BY tm.joined_at DESC LIMIT 1
  ) team_data ON TRUE
  LEFT JOIN public.calendar_event_attendance cea
    ON cea.player_id = r.player_user_id
    AND cea.occurrence_date = dates.day::DATE
    AND cea.event_group_id = coalesce(ce.recurrence_config -> 'meta' ->> 'eventGroupId', ce.id::TEXT)
  WHERE r.guardian_user_id = auth.uid() AND r.status IN ('active','adult_authorised')
    AND (p_player_id IS NULL OR r.player_user_id = p_player_id)
    AND public.guardian_has_permission(r.player_user_id, 'calendar')
    AND (
      ce.guardian_visible
      OR coalesce(ce.recurrence_config -> 'meta' ->> 'coachManaged', 'false') = 'true'
      OR public.guardian_has_permission(r.player_user_id, 'individual_sessions')
    )
  ORDER BY ce.id, r.player_user_id, dates.day, ce.start_time;
END;
$$;

CREATE OR REPLACE FUNCTION public.guardian_get_permissions()
RETURNS TABLE (
  relationship_id UUID, player_id UUID, player_name TEXT, relationship_status TEXT,
  permission_key TEXT, category TEXT, label TEXT, description TEXT, state TEXT, controlled_by TEXT, sort_order INTEGER
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_guardian(auth.uid()) THEN RAISE EXCEPTION 'Guardian account required.' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT r.id, r.player_user_id, coalesce(nullif(btrim(p.display_name), ''), 'Linked player')::TEXT, r.status,
    d.permission_key, d.category, d.label, d.description,
    CASE WHEN r.status IN ('revoked','removed') THEN 'revoked' ELSE coalesce(rp.state, d.default_state) END::TEXT,
    coalesce(rp.controlled_by, d.default_controlled_by)::TEXT, d.sort_order
  FROM public.guardian_player_relationships r
  JOIN public.profiles p ON p.id = r.player_user_id
  CROSS JOIN public.guardian_permission_definitions d
  LEFT JOIN public.guardian_relationship_permissions rp ON rp.relationship_id = r.id AND rp.permission_key = d.permission_key
  WHERE r.guardian_user_id = auth.uid()
  ORDER BY r.is_primary DESC, player_name, d.sort_order;
END;
$$;

CREATE OR REPLACE FUNCTION public.guardian_mark_update_read(p_update_id UUID)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_guardian(auth.uid()) THEN RAISE EXCEPTION 'Guardian account required.' USING ERRCODE = '42501'; END IF;
  UPDATE public.guardian_updates SET is_read = TRUE, read_at = coalesce(read_at, now())
  WHERE id = p_update_id AND guardian_user_id = auth.uid() AND guardian_visible;
  IF NOT FOUND THEN RAISE EXCEPTION 'Update not found.' USING ERRCODE = '42501'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.guardian_acknowledge_update(p_update_id UUID)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_guardian(auth.uid()) THEN RAISE EXCEPTION 'Guardian account required.' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.guardian_updates u WHERE u.id = p_update_id AND u.guardian_user_id = auth.uid() AND u.guardian_visible AND u.acknowledgement_required) THEN
    RAISE EXCEPTION 'Notice is not available for acknowledgement.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.guardian_acknowledgements(update_id, guardian_user_id)
  VALUES (p_update_id, auth.uid()) ON CONFLICT (update_id, guardian_user_id) DO NOTHING;
  UPDATE public.guardian_updates SET is_read = TRUE, read_at = coalesce(read_at, now()), acknowledged_at = coalesce(acknowledged_at, now())
  WHERE id = p_update_id AND guardian_user_id = auth.uid();
END;
$$;

-- Keep direct table privileges narrow. Guardian read/ack mutations use RPCs so message content cannot be edited.
REVOKE ALL ON public.guardian_profiles, public.guardian_player_relationships,
  public.guardian_permission_definitions, public.guardian_relationship_permissions,
  public.guardian_updates, public.guardian_acknowledgements,
  public.guardian_notification_preferences FROM anon, authenticated;
GRANT SELECT ON public.guardian_player_relationships, public.guardian_relationship_permissions,
  public.guardian_updates, public.guardian_acknowledgements TO authenticated;
GRANT SELECT ON public.guardian_permission_definitions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.guardian_profiles, public.guardian_notification_preferences TO authenticated;

REVOKE ALL ON FUNCTION public.is_guardian(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_guardian_relationship(UUID, UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guardian_has_permission(UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guardian_get_linked_players() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guardian_get_player_overview(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guardian_get_events(DATE, DATE, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guardian_get_permissions() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guardian_mark_update_read(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guardian_acknowledge_update(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_guardian(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_guardian_relationship(UUID, UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guardian_has_permission(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guardian_get_linked_players() TO authenticated;
GRANT EXECUTE ON FUNCTION public.guardian_get_player_overview(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guardian_get_events(DATE, DATE, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guardian_get_permissions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.guardian_mark_update_read(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guardian_acknowledge_update(UUID) TO authenticated;

COMMENT ON TABLE public.guardian_player_relationships IS 'Many-to-many Guardian/player links. Invitation and consent workflows are intentionally deferred.';
COMMENT ON TABLE public.guardian_relationship_permissions IS 'Relationship-scoped Guardian access states; Guardians cannot mutate these rows directly.';
COMMENT ON COLUMN public.calendar_events.guardian_visible IS 'Explicit opt-in for Guardian visibility of a player-created event.';
COMMENT ON COLUMN public.injuries.guardian_visible IS 'Explicit opt-in for Guardian-visible injury detail fields; general active flags remain summary-only.';
