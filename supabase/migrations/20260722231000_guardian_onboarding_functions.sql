-- Transactional Guardian onboarding, invitation, age-policy, lifecycle, and write-guard functions.

CREATE OR REPLACE FUNCTION public.has_account_role(p_user_id UUID, p_role TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_account_roles r
    WHERE r.user_id = p_user_id AND r.role = p_role AND r.status = 'active'
  ) OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_user_id AND p.role = p_role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_guardian(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT p_user_id IS NOT NULL AND public.has_account_role(p_user_id, 'guardian'); $$;

CREATE OR REPLACE FUNCTION public.guardian_flag_enabled(p_flag_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce((SELECT enabled FROM public.guardian_feature_flags WHERE flag_key = p_flag_key), FALSE);
$$;

CREATE OR REPLACE FUNCTION public.calculate_player_age(p_date_of_birth DATE, p_as_of DATE DEFAULT current_date)
RETURNS INTEGER
LANGUAGE sql IMMUTABLE SET search_path = public
AS $$
  SELECT CASE WHEN p_date_of_birth IS NULL OR p_as_of < p_date_of_birth THEN NULL
    ELSE extract(YEAR FROM age(p_as_of, p_date_of_birth))::INTEGER END;
$$;

CREATE OR REPLACE FUNCTION public.evaluate_player_age_policy(
  p_date_of_birth DATE,
  p_country_code TEXT DEFAULT 'ZZ',
  p_as_of DATE DEFAULT current_date
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE policy public.age_policy_configurations%ROWTYPE;
DECLARE player_age INTEGER;
DECLARE normalized_country TEXT;
DECLARE age_band TEXT;
DECLARE next_transition DATE;
BEGIN
  IF p_date_of_birth IS NULL OR p_date_of_birth > p_as_of OR p_date_of_birth < p_as_of - INTERVAL '100 years' THEN
    RAISE EXCEPTION 'A valid date of birth is required.' USING ERRCODE = '22023';
  END IF;
  normalized_country := upper(coalesce(nullif(btrim(p_country_code), ''), 'ZZ'));
  SELECT * INTO policy FROM public.age_policy_configurations c
  WHERE c.jurisdiction_code = normalized_country
    AND c.effective_from <= p_as_of AND (c.effective_until IS NULL OR c.effective_until >= p_as_of)
  ORDER BY c.effective_from DESC LIMIT 1;
  IF NOT FOUND THEN
    SELECT * INTO policy FROM public.age_policy_configurations c
    WHERE c.is_fallback AND c.effective_from <= p_as_of AND (c.effective_until IS NULL OR c.effective_until >= p_as_of)
    ORDER BY c.effective_from DESC LIMIT 1;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Age policy is temporarily unavailable.' USING ERRCODE = '55000'; END IF;

  player_age := public.calculate_player_age(p_date_of_birth, p_as_of);
  IF player_age < policy.minimum_self_consent_age THEN
    age_band := 'under_self_consent';
    next_transition := (p_date_of_birth + make_interval(years => policy.minimum_self_consent_age))::DATE;
  ELSIF player_age < policy.guardian_overview_end_age THEN
    age_band := 'minor';
    next_transition := (p_date_of_birth + make_interval(years => policy.guardian_overview_end_age))::DATE;
  ELSE
    age_band := 'adult';
    next_transition := NULL;
  END IF;

  RETURN jsonb_build_object(
    'age', player_age,
    'ageBand', age_band,
    'countryCode', normalized_country,
    'policyVersion', policy.policy_version,
    'minimumSelfConsentAge', policy.minimum_self_consent_age,
    'guardianOverviewEndAge', policy.guardian_overview_end_age,
    'guardianApprovalRequired', age_band = 'under_self_consent',
    'guardianOverviewRequired', age_band IN ('under_self_consent','minor'),
    'nextTransitionAt', next_transition,
    'verificationLevel', policy.guardian_verification_level,
    'jurisdictionFallbackUsed', policy.jurisdiction_code <> normalized_country
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.guardian_write_audit(
  p_event_type TEXT,
  p_subject_player_id UUID DEFAULT NULL,
  p_relationship_id UUID DEFAULT NULL,
  p_invitation_id UUID DEFAULT NULL,
  p_outcome TEXT DEFAULT 'success',
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS VOID
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
  INSERT INTO public.guardian_audit_events(actor_user_id, subject_player_id, relationship_id, invitation_id, event_type, outcome, metadata)
  VALUES (auth.uid(), p_subject_player_id, p_relationship_id, p_invitation_id, p_event_type, p_outcome,
    coalesce(p_metadata, '{}'::JSONB) - 'email' - 'dateOfBirth' - 'health' - 'consentText');
$$;

CREATE OR REPLACE FUNCTION public.guardian_track_product_event(p_event_name TEXT, p_properties JSONB DEFAULT '{}'::JSONB)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF p_event_name NOT IN ('age_step_started','age_step_completed','guardian_invitation_requested','guardian_invitation_sent','guardian_invitation_failed','guardian_invitation_accepted','guardian_approval_granted','guardian_approval_rejected','guardian_onboarding_abandoned','guardian_linking_completed','age_transition_review_completed') THEN
    RAISE EXCEPTION 'Unsupported event.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.guardian_product_events(actor_user_id, event_name, properties)
  VALUES (auth.uid(), p_event_name, coalesce(p_properties,'{}'::JSONB) - 'email' - 'dateOfBirth' - 'health' - 'consentText');
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_guardian_permission_template(p_relationship_id UUID, p_template_key TEXT)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.guardian_permission_templates WHERE template_key = p_template_key AND active) THEN
    RAISE EXCEPTION 'Permission template is unavailable.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.guardian_relationship_permissions(relationship_id, permission_key, state, controlled_by, granted_at)
  SELECT p_relationship_id, i.permission_key, i.state, i.controlled_by,
    CASE WHEN i.state IN ('allowed','required') THEN now() ELSE NULL END
  FROM public.guardian_permission_template_items i WHERE i.template_key = p_template_key
  ON CONFLICT (relationship_id, permission_key) DO UPDATE SET
    state = EXCLUDED.state, controlled_by = EXCLUDED.controlled_by,
    granted_at = CASE WHEN EXCLUDED.state IN ('allowed','required') THEN now() ELSE guardian_relationship_permissions.granted_at END,
    revoked_at = CASE WHEN EXCLUDED.state IN ('revoked','not_allowed') THEN now() ELSE NULL END;
  UPDATE public.guardian_player_relationships SET permission_template_key = p_template_key WHERE id = p_relationship_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.player_is_guardian_restricted(p_player_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.guardian_flag_enabled('under_13_activation_lock_enabled') AND EXISTS (
    SELECT 1 FROM public.player_age_identities a
    WHERE a.player_user_id = p_player_id
      AND a.guardian_approval_required
      AND a.account_state IN ('guardian_required','invitation_pending','approval_pending','rejected','review_required','relationship_revoked')
  );
$$;

CREATE OR REPLACE FUNCTION public.player_set_initial_age(p_date_of_birth DATE, p_country_code TEXT DEFAULT 'ZZ')
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE active_user UUID := auth.uid();
DECLARE evaluation JSONB;
DECLARE state TEXT;
DECLARE profile_role TEXT;
BEGIN
  IF active_user IS NULL THEN RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501'; END IF;
  SELECT role INTO profile_role FROM public.profiles WHERE id = active_user;
  IF NOT (public.has_account_role(active_user, 'player') OR profile_role IS NULL OR profile_role = 'player') THEN
    RAISE EXCEPTION 'Player account required.' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.player_age_identities WHERE player_user_id = active_user) THEN
    RAISE EXCEPTION 'Age information is already recorded. Use the correction request process.' USING ERRCODE = '23505';
  END IF;
  evaluation := public.evaluate_player_age_policy(p_date_of_birth, p_country_code, current_date);
  state := CASE evaluation ->> 'ageBand'
    WHEN 'under_self_consent' THEN 'guardian_required'
    WHEN 'minor' THEN 'invitation_pending'
    ELSE 'active' END;

  INSERT INTO public.profiles(id, age, positions, priorities, role, onboarding_completed)
  VALUES (active_user, (evaluation ->> 'age')::INTEGER, '{}'::TEXT[], '{}'::TEXT[], 'player', FALSE)
  ON CONFLICT (id) DO UPDATE SET age = EXCLUDED.age;
  INSERT INTO public.user_account_roles(user_id, role) VALUES (active_user, 'player')
  ON CONFLICT (user_id, role) DO UPDATE SET status = 'active';
  INSERT INTO public.player_age_identities(
    player_user_id, date_of_birth, country_code, age_band, age_policy_version,
    next_transition_at, guardian_approval_required, guardian_overview_required, account_state
  ) VALUES (
    active_user, p_date_of_birth, evaluation ->> 'countryCode', evaluation ->> 'ageBand', evaluation ->> 'policyVersion',
    (evaluation ->> 'nextTransitionAt')::TIMESTAMPTZ,
    (evaluation ->> 'guardianApprovalRequired')::BOOLEAN,
    (evaluation ->> 'guardianOverviewRequired')::BOOLEAN,
    state
  );
  IF evaluation ->> 'ageBand' = 'minor' THEN
    UPDATE public.player_age_identities SET account_state = 'active' WHERE player_user_id = active_user;
  END IF;
  PERFORM public.guardian_write_audit('date_of_birth_entered', active_user, NULL, NULL, 'success', jsonb_build_object('ageBand', evaluation ->> 'ageBand', 'policyVersion', evaluation ->> 'policyVersion'));
  PERFORM public.guardian_track_product_event('age_step_completed', jsonb_build_object('ageBand', evaluation ->> 'ageBand'));
  RETURN evaluation || jsonb_build_object('accountState', CASE WHEN evaluation ->> 'ageBand' = 'minor' THEN 'active' ELSE state END, 'restricted', evaluation ->> 'ageBand' = 'under_self_consent');
END;
$$;

CREATE OR REPLACE FUNCTION public.player_get_my_guardian_state()
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE active_user UUID := auth.uid();
DECLARE result JSONB;
DECLARE identity public.player_age_identities%ROWTYPE;
DECLARE created_at_value TIMESTAMPTZ;
BEGIN
  IF active_user IS NULL THEN RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO identity FROM public.player_age_identities WHERE player_user_id = active_user;
  SELECT created_at INTO created_at_value FROM auth.users WHERE id = active_user;
  IF NOT FOUND OR identity.player_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'ageKnown', FALSE,
      'ageCheckpointRequired', public.guardian_flag_enabled('date_of_birth_collection_enabled') AND (
        public.guardian_flag_enabled('existing_user_age_checkpoint_enabled') OR created_at_value >= '2026-07-22 00:00:00+00'::TIMESTAMPTZ
      ),
      'restricted', FALSE,
      'featureFlags', (SELECT coalesce(jsonb_object_agg(flag_key, enabled), '{}'::JSONB) FROM public.guardian_feature_flags)
    );
  END IF;

  PERFORM public.process_my_age_transition();
  SELECT * INTO identity FROM public.player_age_identities WHERE player_user_id = active_user;
  SELECT jsonb_build_object(
    'ageKnown', TRUE,
    'ageBand', identity.age_band,
    'countryCode', identity.country_code,
    'policyVersion', identity.age_policy_version,
    'accountState', identity.account_state,
    'guardianApprovalRequired', identity.guardian_approval_required,
    'guardianOverviewRequired', identity.guardian_overview_required,
    'nextTransitionAt', identity.next_transition_at,
    'restricted', public.player_is_guardian_restricted(active_user),
    'invitations', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', i.id, 'guardianEmailMasked', regexp_replace(i.guardian_email, '(^.).*(@.*$)', '\\1***\\2'),
      'guardianName', i.guardian_name, 'relationshipType', i.relationship_type, 'status',
      CASE WHEN i.expires_at <= now() AND i.status IN ('pending','sent','delivered','opened') THEN 'expired' ELSE i.status END,
      'invitationType', i.invitation_type, 'expiresAt', i.expires_at, 'lastSentAt', i.last_sent_at,
      'resendAttempts', i.resend_attempts
    ) ORDER BY i.created_at DESC) FROM public.guardian_invitations i WHERE i.player_user_id = active_user), '[]'::JSONB),
    'relationships', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', r.id, 'guardianName', coalesce(gp.display_name, 'Guardian'), 'relationshipType', r.relationship_type,
      'status', r.status, 'linkedAt', r.linked_at, 'isPrimary', r.is_primary,
      'permissionTemplate', r.permission_template_key
    ) ORDER BY r.created_at DESC) FROM public.guardian_player_relationships r
      LEFT JOIN public.guardian_profiles gp ON gp.user_id = r.guardian_user_id
      WHERE r.player_user_id = active_user), '[]'::JSONB),
    'correctionRequest', (SELECT jsonb_build_object('id', c.id, 'status', c.status, 'createdAt', c.created_at, 'categoryChange', c.category_change)
      FROM public.player_date_of_birth_corrections c WHERE c.player_user_id = active_user ORDER BY c.created_at DESC LIMIT 1),
    'featureFlags', (SELECT coalesce(jsonb_object_agg(flag_key, enabled), '{}'::JSONB) FROM public.guardian_feature_flags)
  ) INTO result;
  RETURN result;
END;
$$;

-- Existing reliable DOB values are migrated into the private policy table without changing the old migration.
INSERT INTO public.player_age_identities(
  player_user_id, date_of_birth, country_code, age_band, age_policy_version, policy_evaluated_at,
  next_transition_at, guardian_approval_required, guardian_overview_required, account_state, source
)
SELECT p.id, p.date_of_birth, evaluation ->> 'countryCode', evaluation ->> 'ageBand', evaluation ->> 'policyVersion', now(),
  (evaluation ->> 'nextTransitionAt')::TIMESTAMPTZ,
  (evaluation ->> 'guardianApprovalRequired')::BOOLEAN,
  (evaluation ->> 'guardianOverviewRequired')::BOOLEAN,
  CASE WHEN evaluation ->> 'ageBand' = 'under_self_consent' THEN 'guardian_required' ELSE 'active' END,
  'profile_migration'
FROM public.profiles p
CROSS JOIN LATERAL public.evaluate_player_age_policy(p.date_of_birth, 'ZZ', current_date) evaluation
WHERE p.role = 'player' AND p.date_of_birth IS NOT NULL
ON CONFLICT (player_user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.guardian_create_invitation(
  p_player_id UUID,
  p_guardian_email TEXT,
  p_guardian_name TEXT,
  p_relationship_type TEXT,
  p_is_primary BOOLEAN DEFAULT FALSE,
  p_invitation_type TEXT DEFAULT NULL,
  p_related_team_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE actor UUID := auth.uid();
DECLARE identity public.player_age_identities%ROWTYPE;
DECLARE normalized_email TEXT;
DECLARE invitation_type_value TEXT;
DECLARE template_key_value TEXT;
DECLARE token_value TEXT;
DECLARE invitation_id UUID;
DECLARE intended_user UUID;
DECLARE expires_value TIMESTAMPTZ := now() + INTERVAL '7 days';
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501'; END IF;
  IF NOT public.guardian_flag_enabled('guardian_onboarding_enabled') THEN RAISE EXCEPTION 'Guardian onboarding is not available.' USING ERRCODE = '55000'; END IF;
  SELECT * INTO identity FROM public.player_age_identities WHERE player_user_id = p_player_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Player age information is required.' USING ERRCODE = '22023'; END IF;
  IF NOT (
    actor = p_player_id
    OR (p_related_team_id IS NOT NULL AND public.can_manage_team(p_related_team_id, actor) AND public.is_active_team_player(p_related_team_id, p_player_id))
    OR EXISTS (SELECT 1 FROM public.guardian_player_relationships r WHERE r.guardian_user_id = actor AND r.player_user_id = p_player_id AND r.status IN ('active','adult_authorised') AND r.is_primary)
  ) THEN
    PERFORM public.guardian_write_audit('invitation_created', p_player_id, NULL, NULL, 'denied', '{}'::JSONB);
    RAISE EXCEPTION 'Not authorised to invite a Guardian for this Player.' USING ERRCODE = '42501';
  END IF;
  normalized_email := lower(btrim(coalesce(p_guardian_email,'')));
  IF normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' OR char_length(normalized_email) > 254 THEN
    RAISE EXCEPTION 'Enter a valid Guardian email address.' USING ERRCODE = '22023';
  END IF;
  IF p_relationship_type NOT IN ('parent','legal_guardian','authorised_guardian') THEN RAISE EXCEPTION 'Invalid relationship type.' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.guardian_invitations i WHERE i.player_user_id = p_player_id AND i.guardian_email = normalized_email AND i.status IN ('draft','pending','sent','delivered','opened','accepted','review_required')) THEN
    RAISE EXCEPTION 'A usable invitation already exists for this Guardian.' USING ERRCODE = '23505';
  END IF;
  IF (SELECT count(*) FROM public.guardian_invitations i WHERE i.created_by = actor AND i.created_at > now() - INTERVAL '1 hour') >= 5 THEN
    RAISE EXCEPTION 'Too many invitation attempts. Try again later.' USING ERRCODE = '54000';
  END IF;
  IF EXISTS (SELECT 1 FROM public.guardian_player_relationships r JOIN auth.users u ON u.id = r.guardian_user_id
    WHERE r.player_user_id = p_player_id AND lower(u.email) = normalized_email AND r.status IN ('active','adult_authorised')) THEN
    RAISE EXCEPTION 'This Guardian relationship is already active.' USING ERRCODE = '23505';
  END IF;

  invitation_type_value := coalesce(p_invitation_type, CASE identity.age_band WHEN 'under_self_consent' THEN 'under13_approval' WHEN 'minor' THEN 'minor_overview' ELSE 'adult_authorisation' END);
  IF invitation_type_value NOT IN ('under13_approval','minor_overview','additional_guardian','coach_initiated','adult_authorisation') THEN RAISE EXCEPTION 'Invalid invitation type.' USING ERRCODE = '22023'; END IF;
  template_key_value := CASE
    WHEN invitation_type_value = 'under13_approval' AND p_is_primary THEN 'under13_primary'
    WHEN invitation_type_value = 'under13_approval' THEN 'under13_secondary'
    WHEN invitation_type_value = 'minor_overview' THEN 'minor_overview'
    WHEN invitation_type_value = 'adult_authorisation' THEN 'adult_limited'
    WHEN invitation_type_value = 'coach_initiated' THEN 'club_limited'
    ELSE CASE identity.age_band WHEN 'under_self_consent' THEN 'under13_secondary' WHEN 'minor' THEN 'minor_overview' ELSE 'adult_limited' END END;
  token_value := encode(extensions.gen_random_bytes(32), 'hex');
  SELECT id INTO intended_user FROM auth.users WHERE lower(email) = normalized_email LIMIT 1;
  INSERT INTO public.guardian_invitations(
    player_user_id, guardian_email, guardian_name, intended_guardian_user_id, relationship_type,
    is_primary, invitation_type, player_age_policy_category, permission_template_key, status,
    token_hash, token_hint, expires_at, created_by, related_team_id, consent_required,
    policy_version, last_sent_at
  ) VALUES (
    p_player_id, normalized_email, nullif(btrim(p_guardian_name),''), intended_user, p_relationship_type,
    p_is_primary, invitation_type_value, identity.age_band, template_key_value, 'sent',
    extensions.digest(token_value, 'sha256'), right(token_value, 6), expires_value, actor, p_related_team_id,
    invitation_type_value = 'under13_approval', identity.age_policy_version, now()
  ) RETURNING id INTO invitation_id;
  UPDATE public.player_age_identities SET account_state = CASE WHEN guardian_approval_required THEN 'invitation_pending' ELSE account_state END WHERE player_user_id = p_player_id;
  PERFORM public.guardian_write_audit('invitation_created', p_player_id, NULL, invitation_id, 'success', jsonb_build_object('invitationType', invitation_type_value));
  PERFORM public.guardian_track_product_event('guardian_invitation_requested', jsonb_build_object('invitationType', invitation_type_value));
  RETURN jsonb_build_object('invitationId', invitation_id, 'token', token_value, 'guardianEmail', normalized_email,
    'guardianName', nullif(btrim(p_guardian_name),''), 'playerId', p_player_id, 'invitationType', invitation_type_value,
    'expiresAt', expires_value, 'policyVersion', identity.age_policy_version);
END;
$$;

CREATE OR REPLACE FUNCTION public.guardian_mark_invitation_delivery(p_invitation_id UUID, p_delivered BOOLEAN, p_failure_code TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501'; END IF;
  UPDATE public.guardian_invitations SET
    status = CASE WHEN p_delivered THEN 'delivered' ELSE 'sent' END,
    failure_code = CASE WHEN p_delivered THEN NULL ELSE left(coalesce(p_failure_code,'delivery_failed'),80) END
  WHERE id = p_invitation_id AND created_by = auth.uid() AND status IN ('sent','delivered');
  IF NOT FOUND THEN RAISE EXCEPTION 'Invitation is unavailable.' USING ERRCODE = '42501'; END IF;
  PERFORM public.guardian_write_audit(CASE WHEN p_delivered THEN 'invitation_sent' ELSE 'invitation_delivery_failed' END, NULL, NULL, p_invitation_id, CASE WHEN p_delivered THEN 'success' ELSE 'failed' END, '{}'::JSONB);
END;
$$;

CREATE OR REPLACE FUNCTION public.guardian_preview_invitation(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE invitation public.guardian_invitations%ROWTYPE;
DECLARE player_name TEXT;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('valid', FALSE, 'reason', 'invalid');
  END IF;
  SELECT * INTO invitation FROM public.guardian_invitations
  WHERE token_hash = extensions.digest(p_token, 'sha256') LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('valid', FALSE, 'reason', 'invalid'); END IF;
  IF invitation.expires_at <= now() AND invitation.status IN ('pending','sent','delivered','opened') THEN
    UPDATE public.guardian_invitations SET status = 'expired' WHERE id = invitation.id;
    PERFORM public.guardian_write_audit('invitation_expired', invitation.player_user_id, NULL, invitation.id, 'failed', '{}'::JSONB);
    RETURN jsonb_build_object('valid', FALSE, 'reason', 'expired');
  END IF;
  IF invitation.status NOT IN ('pending','sent','delivered','opened','accepted','review_required') THEN
    RETURN jsonb_build_object('valid', FALSE, 'reason', invitation.status);
  END IF;
  UPDATE public.guardian_invitations SET status = CASE WHEN status IN ('pending','sent','delivered') THEN 'opened' ELSE status END
  WHERE id = invitation.id;
  SELECT coalesce(nullif(display_name,''),'Player') INTO player_name FROM public.profiles WHERE id = invitation.player_user_id;
  RETURN jsonb_build_object(
    'valid', TRUE, 'invitationId', invitation.id, 'status', invitation.status, 'invitationType', invitation.invitation_type,
    'playerName', coalesce(player_name,'Player'), 'guardianName', invitation.guardian_name,
    'guardianEmail', invitation.guardian_email, 'relationshipType', invitation.relationship_type,
    'isPrimary', invitation.is_primary, 'consentRequired', invitation.consent_required,
    'expiresAt', invitation.expires_at, 'policyVersion', invitation.policy_version
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.guardian_accept_invitation(
  p_token TEXT,
  p_display_name TEXT,
  p_authority_declared BOOLEAN,
  p_preferred_language TEXT DEFAULT 'en'
)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE actor UUID := auth.uid();
DECLARE actor_email TEXT;
DECLARE email_verified BOOLEAN;
DECLARE invitation public.guardian_invitations%ROWTYPE;
DECLARE identity public.player_age_identities%ROWTYPE;
DECLARE relationship_id UUID;
DECLARE relationship_status TEXT;
DECLARE verification_status TEXT;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Sign in with the invited email address to continue.' USING ERRCODE = '42501'; END IF;
  IF NOT p_authority_declared THEN RAISE EXCEPTION 'You must confirm that you are authorised to act as this Player''s Guardian.' USING ERRCODE = '22023'; END IF;
  SELECT lower(email), email_confirmed_at IS NOT NULL INTO actor_email, email_verified FROM auth.users WHERE id = actor;
  IF NOT email_verified THEN RAISE EXCEPTION 'Verify your email address before accepting this invitation.' USING ERRCODE = '42501'; END IF;
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'This invitation link is invalid.' USING ERRCODE = '22023'; END IF;

  SELECT * INTO invitation FROM public.guardian_invitations
  WHERE token_hash = extensions.digest(p_token, 'sha256') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This invitation link is invalid.' USING ERRCODE = '22023'; END IF;
  IF invitation.guardian_email <> actor_email THEN
    PERFORM public.guardian_write_audit('invitation_wrong_email', invitation.player_user_id, NULL, invitation.id, 'denied', '{}'::JSONB);
    RAISE EXCEPTION 'This invitation was sent to a different email address.' USING ERRCODE = '42501';
  END IF;
  IF invitation.expires_at <= now() THEN
    UPDATE public.guardian_invitations SET status = 'expired' WHERE id = invitation.id;
    RAISE EXCEPTION 'This invitation has expired. Ask the Player or Coach to send a new one.' USING ERRCODE = '22023';
  END IF;
  IF invitation.status NOT IN ('pending','sent','delivered','opened') THEN
    RAISE EXCEPTION 'This invitation has already been used or is no longer available.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO identity FROM public.player_age_identities WHERE player_user_id = invitation.player_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'The Player age policy is incomplete.' USING ERRCODE = '55000'; END IF;

  INSERT INTO public.user_account_roles(user_id, role, status, granted_by, metadata)
  VALUES(actor, 'guardian', 'active', actor, jsonb_build_object('source','secure_invitation'))
  ON CONFLICT (user_id, role) DO UPDATE SET status = 'active';
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = actor) THEN
    INSERT INTO public.profiles(id, age, positions, priorities, role, display_name, onboarding_completed)
    VALUES(actor, 18, '{}', '{}', 'guardian', nullif(btrim(p_display_name),''), TRUE);
  END IF;
  INSERT INTO public.guardian_profiles(user_id, display_name, preferred_language)
  VALUES(actor, nullif(btrim(p_display_name),''), coalesce(nullif(btrim(p_preferred_language),''),'en'))
  ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name, preferred_language = EXCLUDED.preferred_language;

  verification_status := CASE WHEN public.guardian_flag_enabled('enhanced_guardian_verification_enabled')
    AND identity.guardian_approval_required THEN 'review_required' ELSE 'verified' END;
  INSERT INTO public.guardian_verification_records(guardian_user_id, invitation_id, method, status, policy_version, verified_at)
  VALUES(actor, invitation.id, 'secure_invitation', verification_status, invitation.policy_version,
    CASE WHEN verification_status = 'verified' THEN now() ELSE NULL END);
  relationship_status := CASE WHEN identity.guardian_approval_required THEN 'pending' ELSE 'active' END;
  INSERT INTO public.guardian_player_relationships(
    guardian_user_id, player_user_id, relationship_type, is_primary, status, access_level,
    relationship_start_date, linked_at, created_by, consent_status, consent_version,
    consent_legal_text_version, verification_status, permission_template_key, metadata
  ) VALUES (
    actor, invitation.player_user_id, invitation.relationship_type, invitation.is_primary, relationship_status,
    (SELECT access_level FROM public.guardian_permission_templates WHERE template_key = invitation.permission_template_key),
    current_date, CASE WHEN relationship_status = 'active' THEN now() ELSE NULL END, invitation.created_by,
    CASE WHEN invitation.consent_required THEN 'pending' ELSE 'not_required' END,
    invitation.policy_version, 'guardian-authority-2026-01',
    CASE WHEN verification_status = 'verified' THEN 'verified' ELSE 'pending' END,
    invitation.permission_template_key, jsonb_build_object('invitationId', invitation.id)
  ) RETURNING id INTO relationship_id;
  PERFORM public.apply_guardian_permission_template(relationship_id, invitation.permission_template_key);
  INSERT INTO public.guardian_consent_history(
    guardian_user_id, player_user_id, relationship_id, invitation_id, decision, consent_category,
    text_version, policy_version, verification_method, metadata
  ) VALUES(actor, invitation.player_user_id, relationship_id, invitation.id, 'granted', 'guardian_relationship',
    'guardian-authority-2026-01', invitation.policy_version, 'verified_email_secure_invitation', jsonb_build_object('authorityDeclared',TRUE));
  UPDATE public.guardian_invitations SET status = CASE WHEN identity.guardian_approval_required THEN 'accepted' ELSE 'approved' END,
    accepted_at = now(), approved_at = CASE WHEN identity.guardian_approval_required THEN NULL ELSE now() END,
    intended_guardian_user_id = actor WHERE id = invitation.id;
  IF identity.guardian_approval_required THEN
    UPDATE public.player_age_identities SET account_state = CASE WHEN verification_status = 'review_required' THEN 'review_required' ELSE 'approval_pending' END
    WHERE player_user_id = invitation.player_user_id;
  ELSE
    INSERT INTO public.guardian_updates(guardian_user_id, update_type, title, message, related_player_id, importance, created_by)
    VALUES(actor, 'relationship_activated', 'Player linked', 'Your read-only Guardian overview is now available.', invitation.player_user_id, 'information', actor);
  END IF;
  PERFORM public.guardian_write_audit('invitation_accepted', invitation.player_user_id, relationship_id, invitation.id, 'success', '{}'::JSONB);
  PERFORM public.guardian_track_product_event('guardian_invitation_accepted', jsonb_build_object('invitationType',invitation.invitation_type));
  RETURN jsonb_build_object('accepted',TRUE,'invitationId',invitation.id,'relationshipId',relationship_id,'requiresApproval',identity.guardian_approval_required,
    'requiresReview',verification_status = 'review_required','playerId',invitation.player_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.guardian_decide_player_account(
  p_invitation_id UUID,
  p_approve BOOLEAN,
  p_optional_consents JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE actor UUID := auth.uid();
DECLARE invitation public.guardian_invitations%ROWTYPE;
DECLARE relationship_id UUID;
DECLARE verification_ok BOOLEAN;
DECLARE consent_key TEXT;
DECLARE consent_value BOOLEAN;
BEGIN
  SELECT * INTO invitation FROM public.guardian_invitations WHERE id = p_invitation_id FOR UPDATE;
  IF NOT FOUND OR actor IS NULL OR invitation.intended_guardian_user_id <> actor OR invitation.status <> 'accepted' THEN
    RAISE EXCEPTION 'Approval request is unavailable.' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO relationship_id FROM public.guardian_player_relationships
  WHERE guardian_user_id = actor AND player_user_id = invitation.player_user_id AND status = 'pending'
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF relationship_id IS NULL THEN RAISE EXCEPTION 'Pending relationship not found.' USING ERRCODE = '22023'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.guardian_verification_records v WHERE v.guardian_user_id = actor
    AND v.invitation_id = invitation.id AND v.status = 'verified') INTO verification_ok;
  IF p_approve AND NOT verification_ok THEN
    UPDATE public.guardian_invitations SET status = 'review_required' WHERE id = invitation.id;
    UPDATE public.guardian_player_relationships SET status = 'support_review' WHERE id = relationship_id;
    UPDATE public.player_age_identities SET account_state = 'review_required' WHERE player_user_id = invitation.player_user_id;
    RETURN jsonb_build_object('approved',FALSE,'reviewRequired',TRUE);
  END IF;

  INSERT INTO public.guardian_consent_history(guardian_user_id, player_user_id, relationship_id, invitation_id,
    decision, consent_category, text_version, policy_version, verification_method)
  VALUES(actor, invitation.player_user_id, relationship_id, invitation.id,
    CASE WHEN p_approve THEN 'granted' ELSE 'rejected' END, 'required_account_approval',
    'guardian-account-approval-2026-01', invitation.policy_version, 'verified_email_secure_invitation');
  FOR consent_key, consent_value IN SELECT key, value::TEXT::BOOLEAN FROM jsonb_each(coalesce(p_optional_consents,'{}'::JSONB)) LOOP
    IF consent_key IN ('ai_assistant','product_research','marketing','optional_data_sharing','optional_analytics') THEN
      INSERT INTO public.guardian_consent_history(guardian_user_id, player_user_id, relationship_id, invitation_id,
        decision, consent_category, text_version, policy_version, verification_method)
      VALUES(actor, invitation.player_user_id, relationship_id, invitation.id,
        CASE WHEN consent_value THEN 'granted' ELSE 'rejected' END, consent_key,
        'guardian-optional-consents-2026-01', invitation.policy_version, 'verified_email_secure_invitation');
    END IF;
  END LOOP;
  IF p_approve THEN
    UPDATE public.guardian_player_relationships SET status='active', linked_at=now(), consent_status='granted',
      consented_at=now(), verification_status='verified' WHERE id=relationship_id;
    UPDATE public.guardian_invitations SET status='approved', approved_at=now() WHERE id=invitation.id;
    UPDATE public.player_age_identities SET account_state='active' WHERE player_user_id=invitation.player_user_id;
    INSERT INTO public.guardian_updates(guardian_user_id, update_type, title, message, related_player_id, importance, created_by)
    VALUES(actor,'approval_granted','Player account approved','The Player account is active and your Guardian overview is available.',invitation.player_user_id,'important',actor);
    PERFORM public.guardian_track_product_event('guardian_approval_granted','{}'::JSONB);
  ELSE
    UPDATE public.guardian_player_relationships SET status='revoked', revoked_at=now(), consent_status='rejected' WHERE id=relationship_id;
    UPDATE public.guardian_invitations SET status='rejected', rejected_at=now() WHERE id=invitation.id;
    UPDATE public.player_age_identities SET account_state='rejected' WHERE player_user_id=invitation.player_user_id;
    PERFORM public.guardian_track_product_event('guardian_approval_rejected','{}'::JSONB);
  END IF;
  PERFORM public.guardian_write_audit(CASE WHEN p_approve THEN 'guardian_approval_granted' ELSE 'guardian_approval_rejected' END,
    invitation.player_user_id, relationship_id, invitation.id, 'success', '{}'::JSONB);
  RETURN jsonb_build_object('approved',p_approve,'reviewRequired',FALSE,'playerId',invitation.player_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.guardian_resend_invitation(p_invitation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE actor UUID := auth.uid();
DECLARE invitation public.guardian_invitations%ROWTYPE;
DECLARE token_value TEXT;
DECLARE expires_value TIMESTAMPTZ := now() + INTERVAL '7 days';
BEGIN
  SELECT * INTO invitation FROM public.guardian_invitations WHERE id=p_invitation_id FOR UPDATE;
  IF NOT FOUND OR actor IS NULL OR NOT (invitation.created_by=actor OR invitation.player_user_id=actor OR
    (invitation.related_team_id IS NOT NULL AND public.can_manage_team(invitation.related_team_id,actor))) THEN
    RAISE EXCEPTION 'Invitation is unavailable.' USING ERRCODE='42501';
  END IF;
  IF invitation.status NOT IN ('pending','sent','delivered','opened','expired') THEN RAISE EXCEPTION 'This invitation cannot be resent.' USING ERRCODE='22023'; END IF;
  IF invitation.last_sent_at > now() - INTERVAL '60 seconds' THEN RAISE EXCEPTION 'Please wait before resending this invitation.' USING ERRCODE='54000'; END IF;
  IF invitation.resend_attempts >= 5 THEN RAISE EXCEPTION 'The resend limit has been reached.' USING ERRCODE='54000'; END IF;
  token_value := encode(extensions.gen_random_bytes(32),'hex');
  UPDATE public.guardian_invitations SET token_hash=extensions.digest(token_value,'sha256'), token_hint=right(token_value,6),
    status='sent', expires_at=expires_value, last_sent_at=now(), resend_attempts=resend_attempts+1, failure_code=NULL
  WHERE id=invitation.id;
  PERFORM public.guardian_write_audit('invitation_resent',invitation.player_user_id,NULL,invitation.id,'success','{}'::JSONB);
  RETURN jsonb_build_object('invitationId',invitation.id,'token',token_value,'guardianEmail',invitation.guardian_email,
    'guardianName',invitation.guardian_name,'playerId',invitation.player_user_id,'invitationType',invitation.invitation_type,
    'expiresAt',expires_value,'policyVersion',invitation.policy_version);
END;
$$;

CREATE OR REPLACE FUNCTION public.guardian_cancel_invitation(p_invitation_id UUID)
RETURNS VOID LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE actor UUID:=auth.uid(); DECLARE invitation public.guardian_invitations%ROWTYPE;
BEGIN
  SELECT * INTO invitation FROM public.guardian_invitations WHERE id=p_invitation_id FOR UPDATE;
  IF NOT FOUND OR actor IS NULL OR NOT (invitation.created_by=actor OR invitation.player_user_id=actor OR
    (invitation.related_team_id IS NOT NULL AND public.can_manage_team(invitation.related_team_id,actor))) THEN
    RAISE EXCEPTION 'Invitation is unavailable.' USING ERRCODE='42501';
  END IF;
  IF invitation.status NOT IN ('pending','sent','delivered','opened','expired') THEN RAISE EXCEPTION 'This invitation cannot be cancelled.' USING ERRCODE='22023'; END IF;
  UPDATE public.guardian_invitations SET status='cancelled',cancelled_at=now() WHERE id=invitation.id;
  PERFORM public.guardian_write_audit('invitation_cancelled',invitation.player_user_id,NULL,invitation.id,'success','{}'::JSONB);
END; $$;

CREATE OR REPLACE FUNCTION public.player_get_guardian_connections()
RETURNS TABLE(
  record_type TEXT, record_id UUID, guardian_name TEXT, guardian_email TEXT,
  relationship_type TEXT, is_primary BOOLEAN, status TEXT, invitation_type TEXT,
  expires_at TIMESTAMPTZ, created_at TIMESTAMPTZ, permissions JSONB
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$
  SELECT 'relationship', r.id, coalesce(gp.display_name,'Guardian'),
    CASE WHEN u.email IS NULL THEN NULL ELSE regexp_replace(u.email,'(^.).*(@.*$)','\1***\2') END,
    r.relationship_type,r.is_primary,r.status,NULL::TEXT,NULL::TIMESTAMPTZ,r.created_at,
    coalesce((SELECT jsonb_agg(jsonb_build_object('key',rp.permission_key,'state',rp.state,'controlledBy',rp.controlled_by)
      ORDER BY rp.permission_key) FROM public.guardian_relationship_permissions rp WHERE rp.relationship_id=r.id),'[]'::JSONB)
  FROM public.guardian_player_relationships r
  LEFT JOIN public.guardian_profiles gp ON gp.user_id=r.guardian_user_id
  LEFT JOIN auth.users u ON u.id=r.guardian_user_id
  WHERE r.player_user_id=auth.uid()
  UNION ALL
  SELECT 'invitation',i.id,coalesce(i.guardian_name,'Invited Guardian'),
    regexp_replace(i.guardian_email,'(^.).*(@.*$)','\1***\2'),i.relationship_type,i.is_primary,i.status,i.invitation_type,
    i.expires_at,i.created_at,'[]'::JSONB
  FROM public.guardian_invitations i WHERE i.player_user_id=auth.uid()
    AND NOT EXISTS(SELECT 1 FROM public.guardian_player_relationships r WHERE (r.metadata->>'invitationId')::UUID=i.id)
  ORDER BY created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.process_my_age_transition()
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public
AS $$
DECLARE actor UUID:=auth.uid(); DECLARE current_identity public.player_age_identities%ROWTYPE;
DECLARE evaluated JSONB; DECLARE new_band TEXT; DECLARE changed_count INTEGER:=0;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required.' USING ERRCODE='42501'; END IF;
  SELECT * INTO current_identity FROM public.player_age_identities WHERE player_user_id=actor FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('processed',FALSE,'reason','age_unknown'); END IF;
  evaluated:=public.evaluate_player_age_policy(current_identity.date_of_birth,current_identity.country_code,current_date);
  new_band:=evaluated->>'ageBand';
  IF new_band=current_identity.age_band THEN RETURN jsonb_build_object('processed',FALSE,'ageBand',new_band); END IF;
  UPDATE public.player_age_identities SET age_band=new_band,age_policy_version=evaluated->>'policyVersion',
    policy_evaluated_at=now(),next_transition_at=(evaluated->>'nextTransitionAt')::TIMESTAMPTZ,
    guardian_approval_required=(evaluated->>'guardianApprovalRequired')::BOOLEAN,
    guardian_overview_required=(evaluated->>'guardianOverviewRequired')::BOOLEAN,
    account_state=CASE WHEN new_band='adult' THEN 'adult_review_pending' ELSE account_state END
  WHERE player_user_id=actor;
  IF new_band='adult' AND public.guardian_flag_enabled('age_18_transition_enabled') THEN
    UPDATE public.guardian_player_relationships SET status='suspended',suspended_at=now(),last_policy_review_at=now()
    WHERE player_user_id=actor AND status='active'; GET DIAGNOSTICS changed_count=ROW_COUNT;
    INSERT INTO public.guardian_age_transitions(player_user_id,transition_type,due_at,status,policy_version,processed_at,metadata)
    VALUES(actor,'reached_adult',now(),'review_required',evaluated->>'policyVersion',now(),jsonb_build_object('relationshipsSuspended',changed_count))
    ON CONFLICT DO NOTHING;
    INSERT INTO public.guardian_updates(guardian_user_id,update_type,title,message,related_player_id,importance,created_by)
    SELECT r.guardian_user_id,'guardian_access_ended','Guardian access paused',
      'The Player reached the adult transition age. Access is paused unless the Player explicitly authorises limited access.',actor,'important',actor
    FROM public.guardian_player_relationships r WHERE r.player_user_id=actor AND r.status='suspended';
    PERFORM public.guardian_write_audit('adult_transition_processed',actor,NULL,NULL,'success',jsonb_build_object('relationshipsSuspended',changed_count));
  END IF;
  RETURN jsonb_build_object('processed',TRUE,'ageBand',new_band,'accountState',CASE WHEN new_band='adult' THEN 'adult_review_pending' ELSE current_identity.account_state END);
END; $$;

CREATE OR REPLACE FUNCTION public.player_decide_adult_guardian_access(p_relationship_id UUID,p_decision TEXT)
RETURNS VOID LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE actor UUID:=auth.uid(); DECLARE relation public.guardian_player_relationships%ROWTYPE; DECLARE template_key TEXT;
BEGIN
  IF p_decision NOT IN ('remove','limited_calendar','limited_safety','limited_standard','decide_later') THEN RAISE EXCEPTION 'Invalid access decision.' USING ERRCODE='22023'; END IF;
  SELECT * INTO relation FROM public.guardian_player_relationships WHERE id=p_relationship_id AND player_user_id=actor AND status IN ('suspended','adult_authorised') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Relationship is unavailable.' USING ERRCODE='42501'; END IF;
  IF p_decision='decide_later' THEN RETURN; END IF;
  IF p_decision='remove' THEN
    UPDATE public.guardian_player_relationships SET status='removed',removed_at=now(),relationship_end_date=current_date,last_policy_review_at=now() WHERE id=relation.id;
  ELSE
    template_key:='adult_limited';
    UPDATE public.guardian_player_relationships SET status='adult_authorised',adult_authorised_at=now(),suspended_at=NULL,
      permission_template_key=template_key,access_level='limited',last_policy_review_at=now(),metadata=metadata||jsonb_build_object('adultDecision',p_decision)
    WHERE id=relation.id;
    PERFORM public.apply_guardian_permission_template(relation.id,template_key);
    IF p_decision='limited_safety' THEN
      UPDATE public.guardian_relationship_permissions SET state=CASE WHEN permission_key IN ('injury_alerts','player_profile_basics','privacy_requests') THEN 'allowed' ELSE 'not_allowed' END,
        controlled_by='player' WHERE relationship_id=relation.id;
    ELSIF p_decision='limited_calendar' THEN
      UPDATE public.guardian_relationship_permissions SET state=CASE WHEN permission_key IN ('calendar','attendance','rsvp','player_profile_basics','privacy_requests') THEN 'allowed' ELSE 'not_allowed' END,
        controlled_by='player' WHERE relationship_id=relation.id;
    END IF;
    INSERT INTO public.guardian_consent_history(guardian_user_id,player_user_id,relationship_id,decision,consent_category,text_version,policy_version,verification_method,metadata)
    VALUES(relation.guardian_user_id,actor,relation.id,'granted','adult_authorisation','adult-access-2026-01',
      (SELECT age_policy_version FROM public.player_age_identities WHERE player_user_id=actor),'authenticated_player',jsonb_build_object('decision',p_decision));
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.guardian_player_relationships WHERE player_user_id=actor AND status IN ('suspended','adult_authorised')) THEN
    UPDATE public.player_age_identities SET account_state='active' WHERE player_user_id=actor;
  END IF;
  INSERT INTO public.guardian_age_transitions(player_user_id,transition_type,due_at,status,policy_version,decision,processed_at)
  VALUES(actor,'adult_decision',now(),'completed',(SELECT age_policy_version FROM public.player_age_identities WHERE player_user_id=actor),p_decision,now()) ON CONFLICT DO NOTHING;
  PERFORM public.guardian_write_audit('adult_access_decision',actor,relation.id,NULL,'success',jsonb_build_object('decision',p_decision));
END; $$;

CREATE OR REPLACE FUNCTION public.player_request_dob_correction(p_requested_date_of_birth DATE,p_reason TEXT)
RETURNS UUID LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE actor UUID:=auth.uid(); DECLARE identity public.player_age_identities%ROWTYPE; DECLARE old_policy JSONB; DECLARE new_policy JSONB; DECLARE request_id UUID;
BEGIN
  SELECT * INTO identity FROM public.player_age_identities WHERE player_user_id=actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'Age information is unavailable.' USING ERRCODE='22023'; END IF;
  IF p_requested_date_of_birth>current_date OR char_length(btrim(coalesce(p_reason,'')))<10 THEN RAISE EXCEPTION 'Provide a valid date and a short explanation.' USING ERRCODE='22023'; END IF;
  old_policy:=public.evaluate_player_age_policy(identity.date_of_birth,identity.country_code,now());
  new_policy:=public.evaluate_player_age_policy(p_requested_date_of_birth,identity.country_code,now());
  INSERT INTO public.player_date_of_birth_corrections(player_user_id,original_date_of_birth,requested_date_of_birth,reason,status,category_change)
  VALUES(actor,identity.date_of_birth,p_requested_date_of_birth,btrim(p_reason),
    CASE WHEN old_policy->>'ageBand'<>new_policy->>'ageBand' THEN 'guardian_confirmation_required' ELSE 'under_review' END,
    old_policy->>'ageBand'<>new_policy->>'ageBand') RETURNING id INTO request_id;
  PERFORM public.guardian_write_audit('dob_correction_requested',actor,NULL,NULL,'pending',jsonb_build_object('categoryChange',old_policy->>'ageBand'<>new_policy->>'ageBand'));
  RETURN request_id;
END; $$;

CREATE OR REPLACE FUNCTION public.revoke_guardian_relationship(p_relationship_id UUID,p_reason TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE actor UUID:=auth.uid(); DECLARE relation public.guardian_player_relationships%ROWTYPE; DECLARE requires_guardian BOOLEAN;
BEGIN
  SELECT * INTO relation FROM public.guardian_player_relationships WHERE id=p_relationship_id FOR UPDATE;
  IF NOT FOUND OR actor IS NULL OR actor NOT IN (relation.player_user_id,relation.guardian_user_id) THEN
    RAISE EXCEPTION 'Relationship is unavailable.' USING ERRCODE='42501';
  END IF;
  IF relation.status NOT IN ('active','adult_authorised','suspended','pending') THEN RAISE EXCEPTION 'Relationship is already closed.' USING ERRCODE='22023'; END IF;
  UPDATE public.guardian_player_relationships SET status='revoked',revoked_at=now(),relationship_end_date=current_date,
    consent_status=CASE WHEN consent_status='granted' THEN 'withdrawn' ELSE consent_status END,
    metadata=metadata||jsonb_build_object('revokedBy',CASE WHEN actor=relation.player_user_id THEN 'player' ELSE 'guardian' END,'reason',left(coalesce(p_reason,''),500))
  WHERE id=relation.id;
  INSERT INTO public.guardian_consent_history(guardian_user_id,player_user_id,relationship_id,decision,consent_category,text_version,policy_version,verification_method,metadata)
  VALUES(relation.guardian_user_id,relation.player_user_id,relation.id,'withdrawn','guardian_relationship','guardian-relationship-withdrawal-2026-01',
    coalesce((SELECT age_policy_version FROM public.player_age_identities WHERE player_user_id=relation.player_user_id),'unknown'),'authenticated_account',jsonb_build_object('revokedBy',actor));
  SELECT guardian_approval_required INTO requires_guardian FROM public.player_age_identities WHERE player_user_id=relation.player_user_id;
  IF requires_guardian AND NOT EXISTS(SELECT 1 FROM public.guardian_player_relationships WHERE player_user_id=relation.player_user_id AND status='active') THEN
    UPDATE public.player_age_identities SET account_state='relationship_revoked' WHERE player_user_id=relation.player_user_id;
  END IF;
  INSERT INTO public.guardian_updates(guardian_user_id,update_type,title,message,related_player_id,importance,created_by)
  VALUES(relation.guardian_user_id,'relationship_revoked','Guardian relationship ended','This Guardian relationship has been revoked. Access to the Player overview has ended.',relation.player_user_id,'important',actor);
  PERFORM public.guardian_write_audit('relationship_revoked',relation.player_user_id,relation.id,NULL,'success',jsonb_build_object('revokedBy',CASE WHEN actor=relation.player_user_id THEN 'player' ELSE 'guardian' END));
END; $$;

CREATE OR REPLACE FUNCTION public.create_guardian_privacy_request(p_request_type TEXT,p_related_player_id UUID DEFAULT NULL,p_related_relationship_id UUID DEFAULT NULL,p_details TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE actor UUID:=auth.uid(); DECLARE request_id UUID; DECLARE role_value TEXT;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required.' USING ERRCODE='42501'; END IF;
  IF p_request_type NOT IN ('view_permissions','correction','data_export','account_deletion','relationship_removal','withdraw_optional_consent','report_unauthorised_access','report_incorrect_relationship') THEN RAISE EXCEPTION 'Invalid request type.' USING ERRCODE='22023'; END IF;
  role_value:=CASE WHEN public.has_account_role(actor,'guardian') THEN 'guardian' ELSE 'player' END;
  IF role_value='guardian' AND p_related_player_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.guardian_player_relationships WHERE guardian_user_id=actor AND player_user_id=p_related_player_id) THEN RAISE EXCEPTION 'Player relationship is unavailable.' USING ERRCODE='42501'; END IF;
  INSERT INTO public.guardian_privacy_requests(requesting_user_id,requester_role,related_player_id,related_relationship_id,request_type,details)
  VALUES(actor,role_value,p_related_player_id,p_related_relationship_id,p_request_type,nullif(btrim(p_details),'')) RETURNING id INTO request_id;
  PERFORM public.guardian_write_audit('privacy_request_submitted',p_related_player_id,p_related_relationship_id,NULL,'pending',jsonb_build_object('requestType',p_request_type));
  RETURN request_id;
END; $$;

CREATE OR REPLACE FUNCTION public.coach_get_guardian_status(p_team_id UUID)
RETURNS TABLE(player_id UUID,player_name TEXT,age_policy_category TEXT,account_state TEXT,guardian_status TEXT,guardian_count BIGINT,pending_invitation_count BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.can_manage_team(p_team_id,auth.uid()) THEN RAISE EXCEPTION 'Not authorised for this team.' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT tm.user_id,coalesce(nullif(p.display_name,''),'Player'),coalesce(ai.age_band,'unknown'),coalesce(ai.account_state,'age_unknown'),
    CASE WHEN count(r.id) FILTER(WHERE r.status IN ('active','adult_authorised'))>0 THEN 'linked'
      WHEN count(i.id) FILTER(WHERE i.status IN ('pending','sent','delivered','opened','accepted','review_required'))>0 THEN 'invited'
      ELSE 'not_linked' END,
    count(DISTINCT r.id) FILTER(WHERE r.status IN ('active','adult_authorised')),
    count(DISTINCT i.id) FILTER(WHERE i.status IN ('pending','sent','delivered','opened','accepted','review_required'))
  FROM public.team_memberships tm JOIN public.profiles p ON p.id=tm.user_id
  LEFT JOIN public.player_age_identities ai ON ai.player_user_id=tm.user_id
  LEFT JOIN public.guardian_player_relationships r ON r.player_user_id=tm.user_id
  LEFT JOIN public.guardian_invitations i ON i.player_user_id=tm.user_id
  WHERE tm.team_id=p_team_id AND tm.role='player' AND tm.status='active'
  GROUP BY tm.user_id,p.display_name,ai.age_band,ai.account_state ORDER BY p.display_name;
END; $$;

CREATE OR REPLACE FUNCTION public.guardian_has_permission(p_player_id UUID,p_permission_key TEXT,p_guardian_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.is_guardian(p_guardian_id) AND EXISTS(
    SELECT 1 FROM public.guardian_player_relationships r
    JOIN public.guardian_permission_definitions d ON d.permission_key=p_permission_key
    LEFT JOIN public.guardian_relationship_permissions rp ON rp.relationship_id=r.id AND rp.permission_key=d.permission_key
    WHERE r.guardian_user_id=p_guardian_id AND r.player_user_id=p_player_id
      AND r.status IN ('active','adult_authorised') AND coalesce(rp.state,d.default_state) IN ('allowed','required'));
$$;

CREATE OR REPLACE FUNCTION public.enforce_restricted_player_write()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE row_user UUID;
BEGIN
  IF auth.uid() IS NULL THEN RETURN coalesce(NEW,OLD); END IF;
  row_user:=CASE TG_TABLE_NAME
    WHEN 'profiles' THEN coalesce(NEW.id,OLD.id)
    ELSE coalesce(NEW.user_id,OLD.user_id) END;
  IF row_user=auth.uid() AND public.player_is_guardian_restricted(row_user) THEN
    PERFORM public.guardian_write_audit('restricted_write_blocked',row_user,NULL,NULL,'denied',jsonb_build_object('table',TG_TABLE_NAME));
    RAISE EXCEPTION 'This Player account is waiting for Guardian approval.' USING ERRCODE='42501';
  END IF;
  RETURN coalesce(NEW,OLD);
END; $$;

DO $$ DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['wellness_logs','training_logs','calendar_events','injuries'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS enforce_guardian_restriction ON public.%I',table_name);
    EXECUTE format('CREATE TRIGGER enforce_guardian_restriction BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_restricted_player_write()',table_name);
  END LOOP;
END; $$;

REVOKE ALL ON FUNCTION public.guardian_preview_invitation(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guardian_accept_invitation(TEXT,TEXT,BOOLEAN,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guardian_decide_player_account(UUID,BOOLEAN,JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guardian_resend_invitation(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guardian_cancel_invitation(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.player_get_guardian_connections() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_my_age_transition() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.player_decide_adult_guardian_access(UUID,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.player_request_dob_correction(DATE,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_guardian_relationship(UUID,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_guardian_privacy_request(TEXT,UUID,UUID,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.coach_get_guardian_status(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.guardian_preview_invitation(TEXT) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guardian_accept_invitation(TEXT,TEXT,BOOLEAN,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guardian_decide_player_account(UUID,BOOLEAN,JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guardian_resend_invitation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guardian_cancel_invitation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.player_get_guardian_connections() TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_my_age_transition() TO authenticated;
GRANT EXECUTE ON FUNCTION public.player_decide_adult_guardian_access(UUID,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.player_request_dob_correction(DATE,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_guardian_relationship(UUID,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_guardian_privacy_request(TEXT,UUID,UUID,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.coach_get_guardian_status(UUID) TO authenticated;

GRANT EXECUTE ON FUNCTION public.player_set_initial_age(DATE,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.player_get_my_guardian_state() TO authenticated;
GRANT EXECUTE ON FUNCTION public.guardian_create_invitation(UUID,TEXT,TEXT,TEXT,BOOLEAN,TEXT,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guardian_mark_invitation_delivery(UUID,BOOLEAN,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.player_is_guardian_restricted(UUID) TO authenticated;
