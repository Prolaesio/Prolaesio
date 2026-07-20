-- Migration: Add date_of_birth to profiles and recurrence_end_date to calendar_events
-- Date: 2026-05-16

-- Feature 2: Add date_of_birth column to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS date_of_birth DATE;
-- Feature 7: Add recurrence_end_date column to calendar_events table
ALTER TABLE calendar_events
ADD COLUMN IF NOT EXISTS recurrence_end_date DATE;
