import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';

import { createPlayerAiResponse } from '@/lib/ai/openai';
import { isAiAssistantEnabled, resolvePlayerAiTier } from '@/lib/ai/model-config';
import { AppRole, isAppRole } from '@/lib/routeRoles';

export const runtime = 'nodejs';

const MAX_MESSAGE_LENGTH = 2000;

type ChatPayload = {
  message?: unknown;
};

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
    return metadataRole ?? 'player';
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

async function requirePlayer(request: NextRequest): Promise<
  | { ok: true; user: User }
  | { ok: false; response: NextResponse<{ error: string }> }
> {
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

  return { ok: true, user };
}

export async function POST(request: NextRequest) {
  if (!isAiAssistantEnabled()) {
    return NextResponse.json({ error: 'Player AI assistant is disabled.' }, { status: 404 });
  }

  let authResult: Awaited<ReturnType<typeof requirePlayer>>;
  try {
    authResult = await requirePlayer(request);
  } catch (error) {
    console.error('[player-ai] Authentication setup failed:', error);
    return NextResponse.json({ error: 'Authentication is not configured.' }, { status: 500 });
  }

  if (!authResult.ok) {
    return authResult.response;
  }

  let payload: ChatPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const message = typeof payload.message === 'string' ? payload.message.trim() : '';

  if (!message) {
    return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.` },
      { status: 400 }
    );
  }

  const tier = await resolvePlayerAiTier();

  try {
    const response = await createPlayerAiResponse({ message, tier });
    return NextResponse.json({ response, tier });
  } catch (error) {
    console.error('[player-ai] OpenAI response failed:', error);
    return NextResponse.json(
      { error: 'Unable to generate a response right now.' },
      { status: 502 }
    );
  }
}

