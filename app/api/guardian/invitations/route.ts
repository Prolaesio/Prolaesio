import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildGuardianEmail, sendGuardianEmail } from '@/lib/guardian/email';

export const runtime = 'nodejs';
const attempts = new Map<string, { count: number; resetAt: number }>();

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}

function rateLimited(request: NextRequest) {
  const key = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt < now) { attempts.set(key, { count: 1, resetAt: now + 10 * 60_000 }); return false; }
  current.count += 1;
  return current.count > 10;
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  if (rateLimited(request)) return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
  const client = createClient(url, key, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!payload) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const action = payload.action;
  if (action === 'cancel') {
    const { error } = await client.rpc('guardian_cancel_invitation', { p_invitation_id: payload.invitationId });
    return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ ok: true });
  }
  const rpc = action === 'resend' ? 'guardian_resend_invitation' : 'guardian_create_invitation';
  const args = action === 'resend' ? { p_invitation_id: payload.invitationId } : {
    p_player_id: payload.playerId,
    p_guardian_email: payload.guardianEmail,
    p_guardian_name: payload.guardianName || null,
    p_relationship_type: payload.relationshipType || 'parent',
    p_is_primary: payload.isPrimary !== false,
    p_invitation_type: payload.invitationType || null,
    p_related_team_id: payload.relatedTeamId || null,
  };
  const { data, error } = await client.rpc(rpc, args);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const invitation = data as { invitationId: string; token: string; guardianEmail: string; guardianName?: string; invitationType: string };
  const origin = new URL(request.url).origin;
  const actionUrl = `${origin}/guardian/invite/${invitation.token}`;
  try {
    const delivery = await sendGuardianEmail(invitation.guardianEmail, buildGuardianEmail(action === 'resend' ? 'reminder' : 'invitation', {
      guardianName: invitation.guardianName,
      actionUrl,
    }));
    await client.rpc('guardian_mark_invitation_delivery', { p_invitation_id: invitation.invitationId, p_delivered: delivery.delivered, p_failure_code: delivery.development ? 'development_log_only' : null });
    return NextResponse.json({ ok: true, invitationId: invitation.invitationId, developmentPreviewUrl: delivery.development ? actionUrl : undefined });
  } catch (mailError) {
    await client.rpc('guardian_mark_invitation_delivery', { p_invitation_id: invitation.invitationId, p_delivered: false, p_failure_code: 'smtp_failed' });
    console.error('[guardian-invitation] delivery failed', mailError);
    return NextResponse.json({ ok: true, invitationId: invitation.invitationId, warning: 'The invitation was saved, but the email could not be delivered. You can resend it.' });
  }
}
