-- Migration: Event Type Activity Toggle + Deletion of Default Event Types
-- Date: 2026-05-22
--
-- 1) Adds an `is_activity` flag used by the "Activity Event" toggle on event
--    types. When true, the event-level Anticipated Intensity picker is shown.
-- 2) Adds an `is_deleted` flag so users can tombstone built-in/default event
--    types without having to physically delete them (built-ins live in code,
--    not in the table — the override row marks them as hidden).

ALTER TABLE public.custom_event_types
  ADD COLUMN IF NOT EXISTS is_activity BOOLEAN DEFAULT false;

ALTER TABLE public.custom_event_types
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
