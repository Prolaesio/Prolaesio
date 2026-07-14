-- Rename Player AI paid tiers from low/high to Pro/Premium.
-- Existing entitlement, usage, and reservation rows are migrated in place.

ALTER TABLE public.ai_entitlements
  DROP CONSTRAINT IF EXISTS ai_entitlements_tier_check;

ALTER TABLE public.ai_usage_reservations
  DROP CONSTRAINT IF EXISTS ai_usage_reservations_tier_check;

ALTER TABLE public.ai_usage
  DROP CONSTRAINT IF EXISTS ai_usage_tier_check;

UPDATE public.ai_entitlements
SET tier = CASE tier
  WHEN 'low' THEN 'pro'
  WHEN 'high' THEN 'premium'
  ELSE tier
END
WHERE tier IN ('low', 'high');

UPDATE public.ai_usage
SET tier = CASE tier
  WHEN 'low' THEN 'pro'
  WHEN 'high' THEN 'premium'
  ELSE tier
END
WHERE tier IN ('low', 'high');

UPDATE public.ai_usage_reservations
SET tier = CASE tier
  WHEN 'low' THEN 'pro'
  WHEN 'high' THEN 'premium'
  ELSE tier
END
WHERE tier IN ('low', 'high');

ALTER TABLE public.ai_entitlements
  ADD CONSTRAINT ai_entitlements_tier_check
  CHECK (tier IN ('free', 'pro', 'premium'));

ALTER TABLE public.ai_usage
  ADD CONSTRAINT ai_usage_tier_check
  CHECK (tier IN ('free', 'pro', 'premium'));

ALTER TABLE public.ai_usage_reservations
  ADD CONSTRAINT ai_usage_reservations_tier_check
  CHECK (tier IN ('free', 'pro', 'premium'));

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

  IF p_tier NOT IN ('free', 'pro', 'premium') THEN
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

REVOKE ALL ON FUNCTION public.reserve_player_ai_message(UUID, TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_player_ai_message(UUID, TEXT, INTEGER, INTEGER) TO authenticated;
