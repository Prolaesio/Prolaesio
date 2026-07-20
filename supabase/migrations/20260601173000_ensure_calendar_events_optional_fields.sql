-- Migration: Ensure optional calendar_events fields used by calendar/analytics loaders
-- Date: 2026-06-01
--
-- This is intentionally idempotent so it is safe across environments.
-- It aligns schema with currently-used app fields without resetting data.

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS recurrence TEXT DEFAULT 'none';
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS recurrence_config JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS recurrence_end_date DATE;
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS excluded_dates JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS overrides JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS anticipated_intensity TEXT;
