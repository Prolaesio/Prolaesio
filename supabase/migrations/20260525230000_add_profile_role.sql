-- Migration: add account role to profiles
-- Date: 2026-05-25
--
-- Adds a role field used for account-level route protection and post-signup
-- role selection.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role TEXT
  CHECK (role IN ('player', 'coach'));
-- Existing users should continue in the athlete/player experience unless they
-- already have an explicit role.
UPDATE public.profiles
SET role = 'player'
WHERE role IS NULL;
