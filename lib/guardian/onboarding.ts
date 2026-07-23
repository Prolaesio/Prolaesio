import { supabase } from '@/lib/supabase';

export type PlayerAgeState = {
  hasAgeIdentity: boolean;
  dateOfBirth?: string;
  countryCode?: string;
  ageBand?: 'under_self_consent' | 'minor' | 'adult';
  accountState: string;
  guardianApprovalRequired: boolean;
  guardianOverviewRequired: boolean;
  guardianRequired?: boolean;
  guardianConnectionRequired?: boolean;
  restricted: boolean;
  policyVersion?: string;
  policyStatus?: string;
  jurisdictionPolicyId?: string;
  ruleType?: 'fixed_age' | 'capacity_based' | 'federal_with_local_overrides' | 'lodario_fallback';
  guardianThreshold?: number | null;
  fallbackUsed?: boolean;
  decisionReason?: string;
  nextTransitionAt?: string | null;
  pendingInvitation?: { id: string; status: string; guardianEmail: string; expiresAt: string } | null;
};

export type InvitationPreview = {
  valid: boolean;
  invitationId?: string;
  reason?: string;
  status?: string;
  invitationType?: string;
  playerName?: string;
  guardianName?: string | null;
  guardianEmail?: string;
  relationshipType?: string;
  isPrimary?: boolean;
  consentRequired?: boolean;
  expiresAt?: string;
  policyVersion?: string;
};

export async function getPlayerAgeState(): Promise<{ data: PlayerAgeState | null; error: string | null }> {
  const { data, error } = await supabase.rpc('player_get_my_guardian_state');
  const raw = data as (PlayerAgeState & { ageKnown?: boolean; ageCheckpointRequired?: boolean; invitations?: Array<{ id: string; status: string; guardianEmailMasked: string; expiresAt: string }> }) | null;
  if (!raw) return { data: null, error: error?.message ?? null };
  return {
    data: {
      ...raw,
      hasAgeIdentity: raw.ageKnown === true || raw.ageCheckpointRequired === false,
      pendingInvitation: raw.invitations?.find(invitation => ['pending','sent','delivered','opened','accepted','review_required','expired'].includes(invitation.status))
        ? (() => { const invitation = raw.invitations!.find(item => ['pending','sent','delivered','opened','accepted','review_required','expired'].includes(item.status))!; return { id: invitation.id, status: invitation.status, guardianEmail: invitation.guardianEmailMasked, expiresAt: invitation.expiresAt }; })()
        : null,
    },
    error: error?.message ?? null,
  };
}

export async function setInitialPlayerAge(dateOfBirth: string, countryCode: string) {
  const { data, error } = await supabase.rpc('player_set_initial_age', {
    p_date_of_birth: dateOfBirth,
    p_country_code: countryCode,
  });
  return { data: data as PlayerAgeState | null, error: error?.message ?? null };
}

export async function previewGuardianInvitation(token: string) {
  const { data, error } = await supabase.rpc('guardian_preview_invitation', { p_token: token });
  return { data: (data as InvitationPreview | null) ?? null, error: error?.message ?? null };
}

export async function acceptGuardianInvitation(token: string, displayName: string, authorityDeclared: boolean) {
  const { data, error } = await supabase.rpc('guardian_accept_invitation', {
    p_token: token,
    p_display_name: displayName,
    p_authority_declared: authorityDeclared,
    p_preferred_language: navigator.language?.split('-')[0] || 'en',
  });
  return { data: data as { accepted: boolean; invitationId: string; relationshipId: string; requiresApproval: boolean; requiresReview: boolean; playerId: string } | null, error: error?.message ?? null };
}

export async function decidePlayerAccount(invitationId: string, approve: boolean, optionalConsents: Record<string, boolean>) {
  const { data, error } = await supabase.rpc('guardian_decide_player_account', {
    p_invitation_id: invitationId,
    p_approve: approve,
    p_optional_consents: optionalConsents,
  });
  return { data, error: error?.message ?? null };
}

export async function createGuardianInvitation(input: {
  playerId: string;
  guardianEmail: string;
  guardianName?: string;
  relationshipType: 'parent' | 'legal_guardian' | 'authorised_guardian';
  isPrimary: boolean;
  invitationType?: string;
  relatedTeamId?: string;
}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { data: null, error: 'Sign in to send a Guardian invitation.' };
  const response = await fetch('/api/guardian/invitations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ action: 'create', ...input }),
  });
  const data = await response.json().catch(() => ({}));
  return { data, error: response.ok ? null : data.error || 'Unable to send the invitation.' };
}

export async function manageGuardianInvitation(action: 'resend' | 'cancel', invitationId: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { data: null, error: 'Sign in to manage this invitation.' };
  const response = await fetch('/api/guardian/invitations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ action, invitationId }),
  });
  const data = await response.json().catch(() => ({}));
  return { data, error: response.ok ? null : data.error || 'Unable to update the invitation.' };
}
