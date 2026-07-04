-- Player AI usage limits and free-tier credit foundation.

CREATE TABLE IF NOT EXISTS public.ai_free_message_credits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  lifetime_free_used INTEGER NOT NULL DEFAULT 0 CHECK (lifetime_free_used >= 0),
  rewarded_ad_credits INTEGER NOT NULL DEFAULT 0 CHECK (rewarded_ad_credits >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_rewarded_ad_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credits_granted INTEGER NOT NULL DEFAULT 10 CHECK (credits_granted > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_rewarded_ad_grants_user_id_created_at_idx
  ON public.ai_rewarded_ad_grants (user_id, created_at DESC);

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
      WHERE tgname = 'set_updated_at_ai_free_message_credits'
    ) THEN
      CREATE TRIGGER set_updated_at_ai_free_message_credits
        BEFORE UPDATE ON public.ai_free_message_credits
        FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
    END IF;
  END IF;
END;
$$;

ALTER TABLE public.ai_free_message_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_rewarded_ad_grants ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ai_free_message_credits'
      AND policyname = 'Users can view own AI free message credits'
  ) THEN
    CREATE POLICY "Users can view own AI free message credits"
      ON public.ai_free_message_credits
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ai_rewarded_ad_grants'
      AND policyname = 'Users can view own AI rewarded ad grants'
  ) THEN
    CREATE POLICY "Users can view own AI rewarded ad grants"
      ON public.ai_rewarded_ad_grants
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_player_ai_free_message(
  p_user_id UUID,
  p_lifetime_limit INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  credit_row public.ai_free_message_credits%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO public.ai_free_message_credits (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT *
  INTO credit_row
  FROM public.ai_free_message_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF credit_row.lifetime_free_used < p_lifetime_limit THEN
    UPDATE public.ai_free_message_credits
    SET lifetime_free_used = lifetime_free_used + 1,
        updated_at = now()
    WHERE user_id = p_user_id;

    RETURN true;
  END IF;

  IF credit_row.rewarded_ad_credits > 0 THEN
    UPDATE public.ai_free_message_credits
    SET rewarded_ad_credits = rewarded_ad_credits - 1,
        updated_at = now()
    WHERE user_id = p_user_id;

    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_player_ai_free_message(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_player_ai_free_message(UUID, INTEGER) TO authenticated;
