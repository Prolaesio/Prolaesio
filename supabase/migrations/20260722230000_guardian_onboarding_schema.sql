-- Guardian onboarding and age-policy lifecycle schema.
-- Additive only. Legal thresholds and wording require jurisdiction-specific review before launch.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- A user may hold more than one independently-authorised workspace role.
CREATE TABLE IF NOT EXISTS public.user_account_roles (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('player', 'coach', 'guardian')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'revoked')),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  PRIMARY KEY (user_id, role)
);

INSERT INTO public.user_account_roles(user_id, role)
SELECT id, role FROM public.profiles WHERE role IN ('player', 'coach', 'guardian')
ON CONFLICT (user_id, role) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.guardian_feature_flags (
  flag_key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL,
  description TEXT NOT NULL,
  rollout_percentage INTEGER NOT NULL DEFAULT 100 CHECK (rollout_percentage BETWEEN 0 AND 100),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.guardian_feature_flags(flag_key, enabled, description) VALUES
  ('guardian_onboarding_enabled', TRUE, 'Enables Guardian invitation and onboarding flows.'),
  ('date_of_birth_collection_enabled', TRUE, 'Collects private date-of-birth data for Player age policy.'),
  ('existing_user_age_checkpoint_enabled', TRUE, 'Prompts existing Players whose age cannot be confirmed.'),
  ('under_13_activation_lock_enabled', TRUE, 'Restricts under-policy-age Players until Guardian approval.'),
  ('guardian_overview_requirement_enabled', TRUE, 'Requires a pending or active Guardian connection for minors.'),
  ('guardian_email_delivery_enabled', TRUE, 'Allows the server email route to deliver Guardian lifecycle email.'),
  ('enhanced_guardian_verification_enabled', FALSE, 'Requires configured enhanced verification before under-age activation.'),
  ('age_18_transition_enabled', TRUE, 'Suspends underage Guardian access when the Player reaches the configured end age.'),
  ('guardian_billing_enabled', FALSE, 'Reserved until a Lodario subscription provider exists.')
ON CONFLICT (flag_key) DO UPDATE SET description = EXCLUDED.description;

CREATE TABLE IF NOT EXISTS public.age_policy_configurations (
  jurisdiction_code TEXT PRIMARY KEY,
  policy_version TEXT NOT NULL,
  minimum_self_consent_age INTEGER NOT NULL CHECK (minimum_self_consent_age BETWEEN 1 AND 20),
  guardian_overview_end_age INTEGER NOT NULL CHECK (guardian_overview_end_age BETWEEN 13 AND 25),
  country_required BOOLEAN NOT NULL DEFAULT TRUE,
  guardian_verification_level TEXT NOT NULL DEFAULT 'email'
    CHECK (guardian_verification_level IN ('email', 'enhanced', 'manual_review')),
  effective_from DATE NOT NULL DEFAULT current_date,
  effective_until DATE,
  is_fallback BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (guardian_overview_end_age > minimum_self_consent_age),
  CHECK (effective_until IS NULL OR effective_until >= effective_from)
);

INSERT INTO public.age_policy_configurations
  (jurisdiction_code, policy_version, minimum_self_consent_age, guardian_overview_end_age, guardian_verification_level, is_fallback)
VALUES
  ('ZZ', 'guardian-age-2026-01', 13, 18, 'email', TRUE),
  ('PT', 'guardian-age-2026-01-pt-review-required', 13, 18, 'email', FALSE),
  ('US', 'guardian-age-2026-01-us-review-required', 13, 18, 'email', FALSE)
ON CONFLICT (jurisdiction_code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.player_age_identities (
  player_user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  date_of_birth DATE NOT NULL,
  country_code TEXT NOT NULL DEFAULT 'ZZ',
  age_band TEXT NOT NULL CHECK (age_band IN ('under_self_consent', 'minor', 'adult')),
  age_policy_version TEXT NOT NULL,
  policy_evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  next_transition_at TIMESTAMPTZ,
  guardian_approval_required BOOLEAN NOT NULL DEFAULT FALSE,
  guardian_overview_required BOOLEAN NOT NULL DEFAULT FALSE,
  account_state TEXT NOT NULL DEFAULT 'active' CHECK (account_state IN (
    'age_known', 'age_unknown', 'confirmation_required', 'guardian_required',
    'invitation_pending', 'approval_pending', 'active', 'rejected',
    'review_required', 'relationship_revoked', 'aged_out', 'adult_review_pending', 'deletion_pending'
  )),
  source TEXT NOT NULL DEFAULT 'player_onboarding' CHECK (source IN ('player_onboarding', 'profile_migration', 'support_correction', 'admin_import')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (date_of_birth <= current_date),
  CHECK (char_length(country_code) BETWEEN 2 AND 3)
);
CREATE INDEX IF NOT EXISTS player_age_transition_idx ON public.player_age_identities(next_transition_at) WHERE next_transition_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS player_age_state_idx ON public.player_age_identities(account_state, age_band);

CREATE TABLE IF NOT EXISTS public.guardian_permission_templates (
  template_key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  age_band TEXT CHECK (age_band IN ('under_self_consent', 'minor', 'adult')),
  access_level TEXT NOT NULL CHECK (access_level IN ('limited', 'standard', 'enhanced', 'custom')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  policy_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.guardian_permission_template_items (
  template_key TEXT NOT NULL REFERENCES public.guardian_permission_templates(template_key) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES public.guardian_permission_definitions(permission_key) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('allowed', 'not_allowed', 'pending', 'revoked', 'required')),
  controlled_by TEXT NOT NULL CHECK (controlled_by IN ('platform', 'player', 'guardian', 'club')),
  PRIMARY KEY (template_key, permission_key)
);

INSERT INTO public.guardian_permission_definitions
  (permission_key, category, label, description, default_state, default_controlled_by, sort_order)
VALUES
  ('ai_feature_status', 'Account', 'AI feature status', 'Whether AI features are enabled, without conversation content.', 'not_allowed', 'platform', 195)
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO public.guardian_permission_templates(template_key, label, description, age_band, access_level, policy_version) VALUES
  ('under13_primary', 'Under-policy-age primary Guardian', 'Required approval and standard read-only overview.', 'under_self_consent', 'standard', 'guardian-permissions-2026-01'),
  ('under13_secondary', 'Under-policy-age secondary Guardian', 'Secondary read-only Guardian overview.', 'under_self_consent', 'limited', 'guardian-permissions-2026-01'),
  ('minor_overview', 'Ages 13–17 Guardian', 'Default read-only overview for a minor Player.', 'minor', 'standard', 'guardian-permissions-2026-01'),
  ('adult_limited', 'Adult-authorised contact', 'Voluntary limited access granted by an adult Player.', 'adult', 'limited', 'guardian-permissions-2026-01'),
  ('club_limited', 'Club-limited Guardian', 'Operational schedule and announcement access.', NULL, 'limited', 'guardian-permissions-2026-01'),
  ('custom_restricted', 'Custom restricted relationship', 'All access denied until explicitly configured.', NULL, 'custom', 'guardian-permissions-2026-01')
ON CONFLICT (template_key) DO NOTHING;

INSERT INTO public.guardian_permission_template_items(template_key, permission_key, state, controlled_by)
SELECT template.template_key, definition.permission_key,
  CASE
    WHEN definition.permission_key IN (
      'calendar','attendance','rsvp','training_completion','wellness_completion','readiness_category',
      'training_summary','injury_alerts','coach_announcements','player_profile_basics','privacy_requests','ai_feature_status'
    ) THEN CASE WHEN definition.permission_key = 'player_profile_basics' THEN 'required' ELSE 'allowed' END
    ELSE 'not_allowed'
  END,
  CASE WHEN definition.permission_key = 'privacy_requests' THEN 'guardian' WHEN definition.permission_key = 'coach_announcements' THEN 'club' ELSE 'platform' END
FROM public.guardian_permission_templates template
CROSS JOIN public.guardian_permission_definitions definition
WHERE template.template_key IN ('under13_primary','minor_overview')
ON CONFLICT (template_key, permission_key) DO NOTHING;

INSERT INTO public.guardian_permission_template_items(template_key, permission_key, state, controlled_by)
SELECT template.template_key, definition.permission_key,
  CASE WHEN definition.permission_key IN ('calendar','attendance','rsvp','coach_announcements','player_profile_basics','privacy_requests')
    THEN CASE WHEN definition.permission_key = 'player_profile_basics' THEN 'required' ELSE 'allowed' END ELSE 'not_allowed' END,
  CASE WHEN definition.permission_key = 'privacy_requests' THEN 'guardian' WHEN definition.permission_key = 'coach_announcements' THEN 'club' ELSE 'platform' END
FROM public.guardian_permission_templates template CROSS JOIN public.guardian_permission_definitions definition
WHERE template.template_key IN ('under13_secondary','adult_limited','club_limited')
ON CONFLICT (template_key, permission_key) DO NOTHING;

INSERT INTO public.guardian_permission_template_items(template_key, permission_key, state, controlled_by)
SELECT 'custom_restricted', permission_key, 'not_allowed', 'player' FROM public.guardian_permission_definitions
ON CONFLICT (template_key, permission_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.guardian_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  guardian_email TEXT NOT NULL,
  guardian_name TEXT,
  intended_guardian_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  relationship_type TEXT NOT NULL CHECK (relationship_type IN ('parent', 'legal_guardian', 'authorised_guardian')),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  invitation_type TEXT NOT NULL CHECK (invitation_type IN ('under13_approval', 'minor_overview', 'additional_guardian', 'coach_initiated', 'adult_authorisation')),
  player_age_policy_category TEXT NOT NULL CHECK (player_age_policy_category IN ('under_self_consent', 'minor', 'adult')),
  permission_template_key TEXT NOT NULL REFERENCES public.guardian_permission_templates(template_key) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'draft','pending','sent','delivered','opened','accepted','approved','rejected','expired','cancelled','replaced','revoked','review_required'
  )),
  token_hash BYTEA NOT NULL UNIQUE,
  token_hint TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  last_reminder_at TIMESTAMPTZ,
  last_sent_at TIMESTAMPTZ,
  resend_attempts INTEGER NOT NULL DEFAULT 0 CHECK (resend_attempts BETWEEN 0 AND 10),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  related_team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  consent_required BOOLEAN NOT NULL DEFAULT FALSE,
  policy_version TEXT NOT NULL,
  failure_code TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (guardian_email = lower(btrim(guardian_email))),
  CHECK (expires_at > created_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS guardian_invitation_one_usable_idx
  ON public.guardian_invitations(player_user_id, guardian_email)
  WHERE status IN ('draft','pending','sent','delivered','opened','accepted','review_required');
CREATE INDEX IF NOT EXISTS guardian_invitation_player_idx ON public.guardian_invitations(player_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS guardian_invitation_intended_idx ON public.guardian_invitations(intended_guardian_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS guardian_invitation_expiry_idx ON public.guardian_invitations(expires_at) WHERE status IN ('pending','sent','delivered','opened');

CREATE TABLE IF NOT EXISTS public.guardian_verification_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guardian_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitation_id UUID REFERENCES public.guardian_invitations(id) ON DELETE SET NULL,
  method TEXT NOT NULL CHECK (method IN ('verified_email','secure_invitation','otp','club_confirmed','manual_review','identity_provider','payment_account','document')),
  status TEXT NOT NULL CHECK (status IN ('pending','verified','failed','expired','review_required')),
  policy_version TEXT NOT NULL,
  verified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  provider_reference TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS guardian_verification_guardian_idx ON public.guardian_verification_records(guardian_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.guardian_consent_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guardian_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  player_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  relationship_id UUID REFERENCES public.guardian_player_relationships(id) ON DELETE SET NULL,
  invitation_id UUID REFERENCES public.guardian_invitations(id) ON DELETE SET NULL,
  decision TEXT NOT NULL CHECK (decision IN ('granted','rejected','withdrawn','superseded')),
  consent_category TEXT NOT NULL CHECK (consent_category IN ('required_account_approval','guardian_relationship','ai_assistant','product_research','marketing','optional_data_sharing','optional_analytics','adult_authorisation','policy_reapproval')),
  text_version TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  verification_method TEXT NOT NULL,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  withdrawn_at TIMESTAMPTZ,
  replaces_consent_id UUID REFERENCES public.guardian_consent_history(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB
);
CREATE INDEX IF NOT EXISTS guardian_consent_relationship_idx ON public.guardian_consent_history(relationship_id, decided_at DESC);
CREATE INDEX IF NOT EXISTS guardian_consent_guardian_idx ON public.guardian_consent_history(guardian_user_id, decided_at DESC);

CREATE TABLE IF NOT EXISTS public.player_date_of_birth_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  original_date_of_birth DATE NOT NULL,
  requested_date_of_birth DATE NOT NULL,
  reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 10 AND 1000),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','guardian_confirmation_required','under_review','approved','rejected','cancelled')),
  category_change BOOLEAN NOT NULL,
  guardian_confirmed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (requested_date_of_birth <= current_date)
);
CREATE UNIQUE INDEX IF NOT EXISTS player_dob_one_open_request_idx ON public.player_date_of_birth_corrections(player_user_id)
  WHERE status IN ('submitted','guardian_confirmation_required','under_review');

CREATE TABLE IF NOT EXISTS public.guardian_age_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transition_type TEXT NOT NULL CHECK (transition_type IN ('approaching_self_consent','reached_self_consent','approaching_adult','reached_adult','adult_decision')),
  due_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','notified','completed','cancelled','review_required')),
  policy_version TEXT NOT NULL,
  decision TEXT CHECK (decision IN ('remove','limited_calendar','limited_safety','limited_standard','decide_later')),
  processed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(player_user_id, transition_type, due_at)
);

CREATE TABLE IF NOT EXISTS public.guardian_privacy_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requesting_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requester_role TEXT NOT NULL CHECK (requester_role IN ('player','guardian')),
  related_player_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  related_relationship_id UUID REFERENCES public.guardian_player_relationships(id) ON DELETE SET NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('view_permissions','correction','data_export','account_deletion','relationship_removal','withdraw_optional_consent','report_unauthorised_access','report_incorrect_relationship')),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','identity_confirmation_required','under_review','more_information_required','approved','rejected','completed','cancelled')),
  details TEXT CHECK (details IS NULL OR char_length(details) <= 4000),
  user_facing_response TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS guardian_privacy_request_requester_idx ON public.guardian_privacy_requests(requesting_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.guardian_privacy_request_internal (
  request_id UUID PRIMARY KEY REFERENCES public.guardian_privacy_requests(id) ON DELETE CASCADE,
  internal_notes TEXT,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.guardian_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  subject_player_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  relationship_id UUID REFERENCES public.guardian_player_relationships(id) ON DELETE SET NULL,
  invitation_id UUID REFERENCES public.guardian_invitations(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  event_version TEXT NOT NULL DEFAULT '1',
  outcome TEXT NOT NULL DEFAULT 'success' CHECK (outcome IN ('success','denied','failed','pending')),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS guardian_audit_subject_idx ON public.guardian_audit_events(subject_player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS guardian_audit_invitation_idx ON public.guardian_audit_events(invitation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.guardian_product_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL CHECK (event_name IN ('age_step_started','age_step_completed','guardian_invitation_requested','guardian_invitation_sent','guardian_invitation_failed','guardian_invitation_accepted','guardian_approval_granted','guardian_approval_rejected','guardian_onboarding_abandoned','guardian_linking_completed','age_transition_review_completed')),
  properties JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Expand relationship lifecycle for age-out and dispute states.
ALTER TABLE public.guardian_player_relationships DROP CONSTRAINT IF EXISTS guardian_player_relationships_status_check;
ALTER TABLE public.guardian_player_relationships
  ADD CONSTRAINT guardian_player_relationships_status_check
  CHECK (status IN ('active','pending','suspended','adult_authorised','support_review','revoked','removed'));
ALTER TABLE public.guardian_player_relationships
  ADD COLUMN IF NOT EXISTS permission_template_key TEXT REFERENCES public.guardian_permission_templates(template_key) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS adult_authorised_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_policy_review_at TIMESTAMPTZ;
DROP INDEX IF EXISTS public.guardian_relationship_one_active_pair_idx;
CREATE UNIQUE INDEX guardian_relationship_one_current_pair_idx
  ON public.guardian_player_relationships(guardian_user_id, player_user_id)
  WHERE status IN ('active','adult_authorised');

ALTER TABLE public.guardian_updates DROP CONSTRAINT IF EXISTS guardian_updates_update_type_check;
ALTER TABLE public.guardian_updates ADD CONSTRAINT guardian_updates_update_type_check CHECK (update_type IN (
  'coach_announcement','team_announcement','schedule_update','event_cancellation','attendance_concern','safety_alert',
  'permission_update','relationship_update','account_notice','invitation_sent','invitation_reminder','invitation_accepted',
  'invitation_rejected','approval_required','approval_granted','approval_withdrawn','relationship_activated',
  'relationship_suspended','relationship_revoked','player_approaching_18','guardian_access_ended',
  'adult_access_reauthorised','privacy_request_update'
));

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'guardian_feature_flags','age_policy_configurations','player_age_identities','guardian_permission_templates',
    'guardian_invitations','player_date_of_birth_corrections','guardian_age_transitions','guardian_privacy_requests'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_' || table_name) THEN
      EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at()', 'set_updated_at_' || table_name, table_name);
    END IF;
  END LOOP;
END;
$$;

ALTER TABLE public.user_account_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardian_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.age_policy_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_age_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardian_permission_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardian_permission_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardian_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardian_verification_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardian_consent_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_date_of_birth_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardian_age_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardian_privacy_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardian_privacy_request_internal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardian_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardian_product_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.user_account_roles, public.guardian_feature_flags, public.age_policy_configurations,
  public.player_age_identities, public.guardian_permission_templates, public.guardian_permission_template_items,
  public.guardian_invitations, public.guardian_verification_records, public.guardian_consent_history,
  public.player_date_of_birth_corrections, public.guardian_age_transitions, public.guardian_privacy_requests,
  public.guardian_privacy_request_internal, public.guardian_audit_events, public.guardian_product_events
FROM anon, authenticated;

CREATE POLICY "Users can view own account roles" ON public.user_account_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Authenticated users can view Guardian feature flags" ON public.guardian_feature_flags
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can view current age policies" ON public.age_policy_configurations
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL AND effective_from <= current_date AND (effective_until IS NULL OR effective_until >= current_date));
CREATE POLICY "Players can view own private age identity" ON public.player_age_identities
  FOR SELECT TO authenticated USING (player_user_id = auth.uid());
CREATE POLICY "Authenticated users can view permission templates" ON public.guardian_permission_templates
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL AND active);
CREATE POLICY "Authenticated users can view permission template items" ON public.guardian_permission_template_items
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Guardians can view own verification records" ON public.guardian_verification_records
  FOR SELECT TO authenticated USING (guardian_user_id = auth.uid());
CREATE POLICY "Guardians can view own consent history" ON public.guardian_consent_history
  FOR SELECT TO authenticated USING (guardian_user_id = auth.uid());
CREATE POLICY "Players can view own date of birth correction requests" ON public.player_date_of_birth_corrections
  FOR SELECT TO authenticated USING (player_user_id = auth.uid());
CREATE POLICY "Players can view own age transitions" ON public.guardian_age_transitions
  FOR SELECT TO authenticated USING (player_user_id = auth.uid());
CREATE POLICY "Users can view own privacy requests" ON public.guardian_privacy_requests
  FOR SELECT TO authenticated USING (requesting_user_id = auth.uid());

GRANT SELECT ON public.user_account_roles, public.guardian_feature_flags, public.age_policy_configurations,
  public.player_age_identities, public.guardian_permission_templates, public.guardian_permission_template_items,
  public.guardian_verification_records, public.guardian_consent_history,
  public.player_date_of_birth_corrections, public.guardian_age_transitions, public.guardian_privacy_requests
TO authenticated;

COMMENT ON TABLE public.player_age_identities IS 'Private authoritative age-policy data. Do not expose through broad profile or Coach queries.';
COMMENT ON TABLE public.guardian_invitations IS 'Invitation tokens are stored only as SHA-256 hashes. Raw tokens are returned once by authorised RPCs.';
COMMENT ON TABLE public.guardian_consent_history IS 'Immutable Guardian consent and approval history. Records are appended, never overwritten.';
COMMENT ON TABLE public.guardian_privacy_request_internal IS 'Internal review notes; never selectable by normal authenticated users.';
