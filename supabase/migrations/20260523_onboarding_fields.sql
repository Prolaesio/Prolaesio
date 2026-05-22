-- Migration: Onboarding profile fields
-- Date: 2026-05-23
--
-- Adds the columns that drive the guided new-user onboarding flow:
--   * height_cm / weight_kg            — basic profile setup (Step 1)
--   * team_code                        — optional team/coach connection (Step 1)
--   * availability                     — weekly availability grid (Step 2)
--   * training_resources               — selected training environments (Step 3)
--   * onboarding_completed             — gate flag for the onboarding flow
--
-- Existing profiles are treated as already onboarded so returning users do
-- not get pushed back through the flow.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS height_cm NUMERIC,
  ADD COLUMN IF NOT EXISTS weight_kg NUMERIC,
  ADD COLUMN IF NOT EXISTS team_code TEXT,
  ADD COLUMN IF NOT EXISTS availability JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS training_resources TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: any profile that already exists is considered fully onboarded.
UPDATE public.profiles
SET onboarding_completed = TRUE
WHERE onboarding_completed IS DISTINCT FROM TRUE;
