-- Player AI entitlement foundation.

CREATE TABLE IF NOT EXISTS public.ai_entitlements (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'low', 'high')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
      WHERE tgname = 'set_updated_at_ai_entitlements'
    ) THEN
      CREATE TRIGGER set_updated_at_ai_entitlements
        BEFORE UPDATE ON public.ai_entitlements
        FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
    END IF;
  END IF;
END;
$$;

ALTER TABLE public.ai_entitlements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ai_entitlements'
      AND policyname = 'Users can view own AI entitlement'
  ) THEN
    CREATE POLICY "Users can view own AI entitlement"
      ON public.ai_entitlements
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END;
$$;

