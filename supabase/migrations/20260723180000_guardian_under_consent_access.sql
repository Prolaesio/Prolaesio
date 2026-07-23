-- Guardian access for Players who are below their jurisdiction's self-consent age.
-- This migration remains read-only for Guardians: it expands sanitized visibility,
-- never exposes raw wellness answers, private notes, full payment card numbers, or CVCs.

UPDATE public.guardian_feature_flags
SET enabled = TRUE,
    description = 'Allows active Guardians of under-consent Players to view provider-supplied masked billing summaries.',
    updated_at = now()
WHERE flag_key = 'guardian_billing_enabled';

UPDATE public.guardian_permission_definitions
SET description = CASE permission_key
  WHEN 'billing' THEN 'Masked billing method and plan details. Full card numbers and security codes are never stored or returned.'
  WHEN 'player_profile_basics' THEN 'Name, date of birth, team, and position for an under-consent Player.'
  ELSE description
END
WHERE permission_key IN ('billing', 'player_profile_basics');

-- New under-consent relationships receive the complete sanitized, read-only set.
INSERT INTO public.guardian_permission_template_items(template_key, permission_key, state, controlled_by)
SELECT template.template_key,
       definition.permission_key,
       CASE WHEN definition.permission_key = 'player_profile_basics' THEN 'required' ELSE 'allowed' END,
       CASE
         WHEN definition.permission_key = 'privacy_requests' THEN 'guardian'
         WHEN definition.permission_key IN ('coach_announcements', 'guardian_visible_documents') THEN 'club'
         ELSE 'platform'
       END
FROM public.guardian_permission_templates template
CROSS JOIN public.guardian_permission_definitions definition
WHERE template.template_key IN ('under13_primary', 'under13_secondary')
ON CONFLICT (template_key, permission_key) DO UPDATE
SET state = EXCLUDED.state,
    controlled_by = EXCLUDED.controlled_by;

-- Upgrade existing relationships only while the Player is currently below the
-- active jurisdiction threshold. Revoked relationships remain unusable because
-- every data RPC also requires an active relationship.
INSERT INTO public.guardian_relationship_permissions(
  relationship_id, permission_key, state, controlled_by, granted_at
)
SELECT relationship.id,
       definition.permission_key,
       CASE WHEN definition.permission_key = 'player_profile_basics' THEN 'required' ELSE 'allowed' END,
       CASE
         WHEN definition.permission_key = 'privacy_requests' THEN 'guardian'
         WHEN definition.permission_key IN ('coach_announcements', 'guardian_visible_documents') THEN 'club'
         ELSE 'platform'
       END,
       now()
FROM public.guardian_player_relationships relationship
JOIN public.player_age_identities identity
  ON identity.player_user_id = relationship.player_user_id
CROSS JOIN public.guardian_permission_definitions definition
WHERE identity.guardian_approval_required
  AND relationship.permission_template_key IN ('under13_primary', 'under13_secondary')
ON CONFLICT (relationship_id, permission_key) DO UPDATE
SET state = EXCLUDED.state,
    controlled_by = EXCLUDED.controlled_by,
    granted_at = coalesce(public.guardian_relationship_permissions.granted_at, EXCLUDED.granted_at),
    revoked_at = NULL;

-- Provider integrations may write only a display-safe summary. There is
-- deliberately no column capable of storing a PAN, CVC, or bank account number.
CREATE TABLE IF NOT EXISTS public.player_billing_summaries (
  player_user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_name TEXT,
  billing_status TEXT NOT NULL DEFAULT 'not_configured'
    CHECK (billing_status IN ('not_configured', 'trialing', 'active', 'past_due', 'paused', 'cancelled')),
  card_brand TEXT CHECK (card_brand IS NULL OR char_length(card_brand) BETWEEN 2 AND 30),
  card_last4 TEXT CHECK (card_last4 IS NULL OR card_last4 ~ '^[0-9]{4}$'),
  card_exp_month INTEGER CHECK (card_exp_month IS NULL OR card_exp_month BETWEEN 1 AND 12),
  card_exp_year INTEGER CHECK (card_exp_year IS NULL OR card_exp_year BETWEEN 2020 AND 2200),
  next_billing_date DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (card_brand IS NULL AND card_last4 IS NULL AND card_exp_month IS NULL AND card_exp_year IS NULL)
    OR
    (card_brand IS NOT NULL AND card_last4 IS NOT NULL)
  )
);

ALTER TABLE public.player_billing_summaries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.player_billing_summaries FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_billing_summaries TO service_role;

CREATE OR REPLACE FUNCTION public.guardian_get_billing_summary(p_player_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE summary public.player_billing_summaries%ROWTYPE;
BEGIN
  IF NOT public.is_guardian(auth.uid()) THEN
    RAISE EXCEPTION 'Guardian account required.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.guardian_flag_enabled('guardian_billing_enabled') THEN
    RETURN jsonb_build_object('enabled', FALSE, 'available', FALSE);
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.guardian_player_relationships relationship
    JOIN public.player_age_identities identity
      ON identity.player_user_id = relationship.player_user_id
    WHERE relationship.guardian_user_id = auth.uid()
      AND relationship.player_user_id = p_player_id
      AND relationship.status = 'active'
      AND identity.guardian_approval_required
  ) OR NOT public.guardian_has_permission(p_player_id, 'billing') THEN
    RAISE EXCEPTION 'Billing information is not available for this relationship.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO summary
  FROM public.player_billing_summaries
  WHERE player_user_id = p_player_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'enabled', TRUE,
      'available', FALSE,
      'message', 'No billing method is connected to this Player.'
    );
  END IF;

  RETURN jsonb_build_object(
    'enabled', TRUE,
    'available', summary.card_last4 IS NOT NULL OR summary.plan_name IS NOT NULL,
    'planName', summary.plan_name,
    'billingStatus', summary.billing_status,
    'cardBrand', summary.card_brand,
    'cardLast4', summary.card_last4,
    'maskedCard', CASE WHEN summary.card_last4 IS NULL THEN NULL ELSE '•••• ' || summary.card_last4 END,
    'cardExpMonth', summary.card_exp_month,
    'cardExpYear', summary.card_exp_year,
    'nextBillingDate', summary.next_billing_date,
    'updatedAt', summary.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.guardian_get_billing_summary(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardian_get_billing_summary(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.guardian_get_player_profile_summary(p_player_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE result JSONB;
BEGIN
  IF NOT public.is_guardian(auth.uid()) THEN
    RAISE EXCEPTION 'Guardian account required.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.guardian_player_relationships relationship
    JOIN public.player_age_identities identity
      ON identity.player_user_id = relationship.player_user_id
    WHERE relationship.guardian_user_id = auth.uid()
      AND relationship.player_user_id = p_player_id
      AND relationship.status = 'active'
      AND identity.guardian_approval_required
  ) OR NOT public.guardian_has_permission(p_player_id, 'player_profile_basics') THEN
    RAISE EXCEPTION 'Player profile information is not available for this relationship.' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'dateOfBirth', identity.date_of_birth,
    'age', public.calculate_player_age(identity.date_of_birth, current_date),
    'countryCode', identity.country_code
  ) INTO result
  FROM public.player_age_identities identity
  WHERE identity.player_user_id = p_player_id;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.guardian_get_player_profile_summary(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardian_get_player_profile_summary(UUID) TO authenticated;

-- The age-identity table is the authoritative DOB source. Return it only to the
-- signed-in Player through the existing self-service state RPC.
CREATE OR REPLACE FUNCTION public.player_get_my_guardian_state()
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE active_user UUID:=auth.uid();
DECLARE identity public.player_age_identities%ROWTYPE;
DECLARE created_at_value TIMESTAMPTZ;
BEGIN
  IF active_user IS NULL THEN RAISE EXCEPTION 'Authentication required.' USING ERRCODE='42501'; END IF;
  SELECT * INTO identity FROM public.player_age_identities WHERE player_user_id=active_user;
  SELECT created_at INTO created_at_value FROM auth.users WHERE id=active_user;
  IF identity.player_user_id IS NULL THEN
    RETURN jsonb_build_object('ageKnown',FALSE,'ageCheckpointRequired',
      public.guardian_flag_enabled('date_of_birth_collection_enabled') AND
      (public.guardian_flag_enabled('existing_user_age_checkpoint_enabled') OR created_at_value>='2026-07-22 00:00:00+00'::TIMESTAMPTZ),
      'restricted',FALSE,'featureFlags',(SELECT coalesce(jsonb_object_agg(flag_key,enabled),'{}'::JSONB) FROM public.guardian_feature_flags));
  END IF;
  PERFORM public.process_my_age_transition();
  SELECT * INTO identity FROM public.player_age_identities WHERE player_user_id=active_user;
  RETURN jsonb_build_object(
    'ageKnown',TRUE,'dateOfBirth',identity.date_of_birth,'ageBand',identity.age_band,'countryCode',identity.country_code,
    'jurisdictionPolicyId',identity.jurisdiction_policy_id,'policyVersion',identity.age_policy_version,
    'policyStatus',identity.policy_status,'fallbackUsed',identity.fallback_used,'decisionReason',identity.decision_reason,
    'accountState',identity.account_state,'guardianRequired',identity.guardian_connection_required,
    'guardianApprovalRequired',identity.guardian_approval_required,
    'guardianConnectionRequired',identity.guardian_connection_required,
    'guardianOverviewRequired',identity.guardian_overview_required,'nextTransitionAt',identity.next_transition_at,
    'restricted',public.player_is_guardian_restricted(active_user),
    'invitations',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',i.id,'guardianEmailMasked',regexp_replace(i.guardian_email,'(^.).*(@.*$)','\1***\2'),
      'guardianName',i.guardian_name,'relationshipType',i.relationship_type,
      'status',CASE WHEN i.expires_at<=now() AND i.status IN ('pending','sent','delivered','opened') THEN 'expired' ELSE i.status END,
      'invitationType',i.invitation_type,'expiresAt',i.expires_at,'lastSentAt',i.last_sent_at,'resendAttempts',i.resend_attempts
    ) ORDER BY i.created_at DESC) FROM public.guardian_invitations i WHERE i.player_user_id=active_user),'[]'::JSONB),
    'relationships',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',r.id,'guardianName',coalesce(gp.display_name,'Guardian'),'relationshipType',r.relationship_type,
      'status',r.status,'linkedAt',r.linked_at,'isPrimary',r.is_primary,'permissionTemplate',r.permission_template_key
    ) ORDER BY r.created_at DESC) FROM public.guardian_player_relationships r
      LEFT JOIN public.guardian_profiles gp ON gp.user_id=r.guardian_user_id WHERE r.player_user_id=active_user),'[]'::JSONB),
    'correctionRequest',(SELECT jsonb_build_object('id',c.id,'status',c.status,'createdAt',c.created_at,'categoryChange',c.category_change)
      FROM public.player_date_of_birth_corrections c WHERE c.player_user_id=active_user ORDER BY c.created_at DESC LIMIT 1),
    'policyNotifications',coalesce((SELECT jsonb_agg(jsonb_build_object('id',n.id,'type',n.notification_type,'title',n.title,'message',n.message,'createdAt',n.created_at)
      ORDER BY n.created_at DESC) FROM public.player_policy_notifications n WHERE n.player_user_id=active_user AND NOT n.is_read),'[]'::JSONB),
    'featureFlags',(SELECT coalesce(jsonb_object_agg(flag_key,enabled),'{}'::JSONB) FROM public.guardian_feature_flags)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.player_get_my_guardian_state() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_get_my_guardian_state() TO authenticated;

COMMENT ON TABLE public.player_billing_summaries IS
  'Provider-written display-safe billing summaries. Full card numbers, CVCs, and bank account numbers must never be stored here.';
COMMENT ON FUNCTION public.guardian_get_billing_summary(UUID) IS
  'Returns masked billing metadata only to an active Guardian while the Player remains below the applicable self-consent threshold.';
COMMENT ON FUNCTION public.guardian_get_player_profile_summary(UUID) IS
  'Returns DOB, completed age, and residence country only to an active Guardian of a Player below the applicable self-consent threshold.';
