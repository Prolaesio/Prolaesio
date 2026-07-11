import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';

import { AppRole, isAppRole } from '@/lib/routeRoles';

export type PlayerAiContext = {
  user: User;
  supabase: SupabaseClient;
};

type PlayerAiAuthResult =
  | { ok: true; context: PlayerAiContext }
  | { ok: false; response: NextResponse<{ error: string }> };

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getBearerToken(request: NextRequest): string | null {
  const authorization = request.headers.get('authorization');
  const [scheme, token] = authorization?.split(' ') ?? [];

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token;
}

function getServerSupabaseClient(accessToken: string): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase environment variables are not configured.');
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

async function resolveUserRole(
  supabase: SupabaseClient,
  user: User
): Promise<AppRole | null> {
  const metadataRole = isAppRole(user.user_metadata?.role) ? user.user_metadata.role : null;
  const needsRoleSelection = user.user_metadata?.needs_role_selection === true;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    console.error('[player-ai] Error resolving user role:', error);
    return metadataRole;
  }

  if (!profile) {
    if (metadataRole) return metadataRole;
    return needsRoleSelection ? null : 'player';
  }

  if (isAppRole(profile.role)) {
    return profile.role;
  }

  return metadataRole ?? 'player';
}

export async function requirePlayerAiContext(request: NextRequest): Promise<PlayerAiAuthResult> {
  const accessToken = getBearerToken(request);

  if (!accessToken) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }),
    };
  }

  const supabase = getServerSupabaseClient(accessToken);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }),
    };
  }

  const role = await resolveUserRole(supabase, user);

  if (role !== 'player') {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Player account required.' }, { status: 403 }),
    };
  }

  return { ok: true, context: { user, supabase } };
}

export function normalizeConversationId(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  return trimmed;
}

