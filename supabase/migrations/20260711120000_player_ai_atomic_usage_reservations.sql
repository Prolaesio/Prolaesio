-- Atomic Player AI usage reservations.
--
-- This prevents concurrent requests from passing the limit check before usage is written.

CREATE TABLE IF NOT EXISTS public.ai_usage_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL DEFAULT current_date,
  tier TEXT NOT NULL CHECK (tier IN ('free', 'low', 'high')),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'succeeded', 'failed', 'refunded')),
  free_credit_source TEXT CHECK (free_credit_source IN ('lifetime', 'rewarded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_reservations_user_id_usage_date_status_idx
  ON public.ai_usage_reservations (user_id, usage_date, status);

CREATE INDEX IF NOT EXISTS ai_usage_reservations_user_id_tier_usage_date_status_idx
  ON public.ai_usage_reservations (user_id, tier, usage_date, status);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'handle_updated_at'
      AND pg_function_is_visible(oid)
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'set_updated_at_ai_usage_reservations'
    ) THEN
      CREATE TRIGGER set_updated_at_ai_usage_reservations
        BEFORE UPDATE ON public.ai_usage_reservations
        FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
    END IF;
  END IF;
END;
$$;

ALTER TABLE public.ai_usage_reservations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ai_usage_reservations'
      AND policyname = 'Users can view own AI usage reservations'
  ) THEN
    CREATE POLICY "Users can view own AI usage reservations"
      ON public.ai_usage_reservations
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END;
$$;

INSERT INTO public.ai_usage_reservations (user_id, usage_date, tier, status, created_at, updated_at)
SELECT
  usage_rows.user_id,
  usage_rows.usage_date,
  usage_rows.tier,
  'succeeded',
  usage_rows.created_at,
  usage_rows.created_at
FROM public.ai_usage usage_rows
CROSS JOIN LATERAL generate_series(1, greatest(usage_rows.request_count, 1)) AS expanded(_)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.ai_usage_reservations existing
  WHERE existing.user_id = usage_rows.user_id
    AND existing.usage_date = usage_rows.usage_date
    AND existing.tier = usage_rows.tier
    AND existing.status = 'succeeded'
);

CREATE OR REPLACE FUNCTION public.reserve_player_ai_message(
  p_user_id UUID,
  p_tier TEXT,
  p_free_lifetime_limit INTEGER,
  p_daily_limit INTEGER
)
RETURNS TABLE (
  reservation_id UUID,
  allowed BOOLEAN,
  code TEXT,
  limit_value INTEGER,
  used_count INTEGER,
  remaining_count INTEGER,
  rewarded_ad_credits INTEGER,
  free_credit_source TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  credit_row public.ai_free_message_credits%ROWTYPE;
  current_used INTEGER := 0;
  current_remaining INTEGER := 0;
  next_reservation_id UUID;
  consumed_source TEXT;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_tier NOT IN ('free', 'low', 'high') THEN
    RAISE EXCEPTION 'Invalid tier';
  END IF;

  IF p_tier = 'free' THEN
    INSERT INTO public.ai_free_message_credits (user_id)
    VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;

    SELECT *
    INTO credit_row
    FROM public.ai_free_message_credits
    WHERE user_id = p_user_id
    FOR UPDATE;

    current_remaining :=
      greatest(p_free_lifetime_limit - credit_row.lifetime_free_used, 0)
      + credit_row.rewarded_ad_credits;

    IF current_remaining <= 0 THEN
      RETURN QUERY SELECT
        NULL::UUID,
        false,
        'free_limit_reached',
        p_free_lifetime_limit,
        credit_row.lifetime_free_used,
        0,
        credit_row.rewarded_ad_credits,
        NULL::TEXT;
      RETURN;
    END IF;

    IF credit_row.lifetime_free_used < p_free_lifetime_limit THEN
      consumed_source := 'lifetime';

      UPDATE public.ai_free_message_credits
      SET lifetime_free_used = lifetime_free_used + 1,
          updated_at = now()
      WHERE user_id = p_user_id;
    ELSE
      consumed_source := 'rewarded';

      UPDATE public.ai_free_message_credits
      SET rewarded_ad_credits = greatest(rewarded_ad_credits - 1, 0),
          updated_at = now()
      WHERE user_id = p_user_id;
    END IF;

    INSERT INTO public.ai_usage_reservations (user_id, tier, status, free_credit_source)
    VALUES (p_user_id, p_tier, 'reserved', consumed_source)
    RETURNING id INTO next_reservation_id;

    SELECT *
    INTO credit_row
    FROM public.ai_free_message_credits
    WHERE user_id = p_user_id;

    current_remaining :=
      greatest(p_free_lifetime_limit - credit_row.lifetime_free_used, 0)
      + credit_row.rewarded_ad_credits;

    RETURN QUERY SELECT
      next_reservation_id,
      true,
      'reserved',
      p_free_lifetime_limit,
      credit_row.lifetime_free_used,
      current_remaining,
      credit_row.rewarded_ad_credits,
      consumed_source;
    RETURN;
  END IF;

  IF p_daily_limit <= 0 THEN
    RAISE EXCEPTION 'Invalid daily limit';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::TEXT || ':' || current_date::TEXT || ':' || p_tier));

  SELECT count(*)::INTEGER
  INTO current_used
  FROM public.ai_usage_reservations
  WHERE user_id = p_user_id
    AND usage_date = current_date
    AND tier = p_tier
    AND status IN ('reserved', 'succeeded');

  IF current_used >= p_daily_limit THEN
    RETURN QUERY SELECT
      NULL::UUID,
      false,
      'daily_limit_reached',
      p_daily_limit,
      current_used,
      0,
      NULL::INTEGER,
      NULL::TEXT;
    RETURN;
  END IF;

  INSERT INTO public.ai_usage_reservations (user_id, tier, status)
  VALUES (p_user_id, p_tier, 'reserved')
  RETURNING id INTO next_reservation_id;

  RETURN QUERY SELECT
    next_reservation_id,
    true,
    'reserved',
    p_daily_limit,
    current_used + 1,
    greatest(p_daily_limit - current_used - 1, 0),
    NULL::INTEGER,
    NULL::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_player_ai_message_reservation(
  p_user_id UUID,
  p_reservation_id UUID,
  p_success BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reservation_row public.ai_usage_reservations%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT *
  INTO reservation_row
  FROM public.ai_usage_reservations
  WHERE id = p_reservation_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF reservation_row.status <> 'reserved' THEN
    RETURN true;
  END IF;

  IF p_success THEN
    UPDATE public.ai_usage_reservations
    SET status = 'succeeded',
        updated_at = now()
    WHERE id = p_reservation_id
      AND user_id = p_user_id;

    RETURN true;
  END IF;

  IF reservation_row.tier = 'free' THEN
    IF reservation_row.free_credit_source = 'lifetime' THEN
      UPDATE public.ai_free_message_credits
      SET lifetime_free_used = greatest(lifetime_free_used - 1, 0),
          updated_at = now()
      WHERE user_id = p_user_id;
    ELSIF reservation_row.free_credit_source = 'rewarded' THEN
      UPDATE public.ai_free_message_credits
      SET rewarded_ad_credits = rewarded_ad_credits + 1,
          updated_at = now()
      WHERE user_id = p_user_id;
    END IF;

    UPDATE public.ai_usage_reservations
    SET status = 'refunded',
        updated_at = now()
    WHERE id = p_reservation_id
      AND user_id = p_user_id;

    RETURN true;
  END IF;

  UPDATE public.ai_usage_reservations
  SET status = 'failed',
      updated_at = now()
  WHERE id = p_reservation_id
    AND user_id = p_user_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_player_ai_message(UUID, TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_player_ai_message(UUID, TEXT, INTEGER, INTEGER) TO authenticated;

REVOKE ALL ON FUNCTION public.complete_player_ai_message_reservation(UUID, UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_player_ai_message_reservation(UUID, UUID, BOOLEAN) TO authenticated;
