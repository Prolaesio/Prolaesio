-- LOCAL DEVELOPMENT ONLY: Guardian platform scenario seed.
-- This file is deliberately not a migration and creates no public bypass.
--
-- 1. Start local Supabase and create the five Auth users below through the local Auth UI/API.
-- 2. Replace every @lodario.local placeholder with those local-only user emails.
-- 3. Run this file against the local database only.

BEGIN;

CREATE TEMP TABLE guardian_seed_accounts (
  key TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE
) ON COMMIT DROP;

INSERT INTO guardian_seed_accounts(key, email) VALUES
  ('guardian_one', 'guardian.one@lodario.local'),
  ('guardian_two', 'guardian.two@lodario.local'),
  ('player_one', 'player.one@lodario.local'),
  ('player_two', 'player.two@lodario.local'),
  ('player_three', 'player.three@lodario.local');

DO $$
DECLARE missing_count INTEGER;
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Run this seed only from a trusted local database session.';
  END IF;
  SELECT count(*) INTO missing_count
  FROM guardian_seed_accounts s LEFT JOIN auth.users u ON lower(u.email) = lower(s.email)
  WHERE u.id IS NULL;
  IF missing_count > 0 THEN
    RAISE EXCEPTION '% local Auth users are missing. Create all seed users first.', missing_count;
  END IF;
END;
$$;

UPDATE public.profiles p SET role = 'guardian', onboarding_completed = TRUE
FROM auth.users u, guardian_seed_accounts s
WHERE p.id = u.id AND lower(u.email) = lower(s.email) AND s.key IN ('guardian_one','guardian_two');
UPDATE public.profiles p SET role = 'player', display_name = initcap(replace(split_part(u.email, '@', 1), '.', ' ')), onboarding_completed = TRUE
FROM auth.users u, guardian_seed_accounts s
WHERE p.id = u.id AND lower(u.email) = lower(s.email) AND s.key LIKE 'player_%';

INSERT INTO public.guardian_profiles(user_id, display_name, preferred_language, time_zone)
SELECT u.id, initcap(replace(split_part(u.email, '@', 1), '.', ' ')), 'en', 'Europe/Lisbon'
FROM auth.users u JOIN guardian_seed_accounts s ON lower(s.email) = lower(u.email)
WHERE s.key LIKE 'guardian_%'
ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name;

INSERT INTO public.guardian_player_relationships
  (guardian_user_id, player_user_id, relationship_type, is_primary, status, access_level, linked_at, relationship_start_date, consent_status, verification_status)
SELECT g.id, p.id, v.relationship_type, v.is_primary, v.status, v.access_level,
  CASE WHEN v.status = 'active' THEN now() - interval '30 days' ELSE NULL END,
  current_date - 30, CASE WHEN v.status = 'pending' THEN 'pending' ELSE 'granted' END, 'verified'
FROM (VALUES
  ('guardian_one','player_one','parent',TRUE,'active','enhanced'),
  ('guardian_one','player_two','legal_guardian',FALSE,'active','limited'),
  ('guardian_one','player_three','authorised_guardian',FALSE,'pending','standard'),
  ('guardian_two','player_one','parent',FALSE,'active','standard'),
  ('guardian_two','player_two','parent',TRUE,'revoked','standard')
) v(guardian_key, player_key, relationship_type, is_primary, status, access_level)
JOIN guardian_seed_accounts gs ON gs.key = v.guardian_key JOIN auth.users g ON lower(g.email) = lower(gs.email)
JOIN guardian_seed_accounts ps ON ps.key = v.player_key JOIN auth.users p ON lower(p.email) = lower(ps.email)
WHERE NOT EXISTS (
  SELECT 1 FROM public.guardian_player_relationships r
  WHERE r.guardian_user_id = g.id AND r.player_user_id = p.id AND r.status = v.status
);

-- Demonstrate different permission levels.
INSERT INTO public.guardian_relationship_permissions(relationship_id, permission_key, state, controlled_by, granted_at)
SELECT r.id, override.permission_key, override.state, 'player', CASE WHEN override.state = 'allowed' THEN now() ELSE NULL END
FROM public.guardian_player_relationships r
JOIN guardian_seed_accounts gs ON gs.key = 'guardian_one'
JOIN auth.users g ON lower(g.email) = lower(gs.email) AND g.id = r.guardian_user_id
JOIN guardian_seed_accounts ps ON ps.key = 'player_two'
JOIN auth.users p ON lower(p.email) = lower(ps.email) AND p.id = r.player_user_id
CROSS JOIN (VALUES ('readiness_score','not_allowed'), ('pain_severity','not_allowed'), ('pain_location','not_allowed'), ('training_load','not_allowed')) override(permission_key, state)
ON CONFLICT (relationship_id, permission_key) DO UPDATE SET state = EXCLUDED.state, controlled_by = EXCLUDED.controlled_by;

-- Active safety alert for player one. Description is deliberately not Guardian-visible.
INSERT INTO public.injuries(user_id, description, status, guardian_visible, guardian_body_area, professional_attention_suggested)
SELECT u.id, 'Local seed: private injury detail', 'active', TRUE, 'Lower leg', TRUE
FROM auth.users u JOIN guardian_seed_accounts s ON s.key = 'player_one' AND lower(s.email) = lower(u.email)
WHERE NOT EXISTS (SELECT 1 FROM public.injuries i WHERE i.user_id = u.id AND i.description = 'Local seed: private injury detail');

INSERT INTO public.guardian_updates
  (guardian_user_id, update_type, title, message, related_player_id, importance, acknowledgement_required)
SELECT g.id, 'safety_alert', 'Please review the latest safety update',
  'General safety information is available for this linked player. This is not a medical diagnosis.', p.id, 'important', TRUE
FROM auth.users g JOIN guardian_seed_accounts gs ON gs.key = 'guardian_one' AND lower(gs.email) = lower(g.email)
JOIN guardian_seed_accounts ps ON ps.key = 'player_one' JOIN auth.users p ON lower(ps.email) = lower(p.email)
WHERE NOT EXISTS (SELECT 1 FROM public.guardian_updates u WHERE u.guardian_user_id = g.id AND u.title = 'Please review the latest safety update');

COMMIT;
