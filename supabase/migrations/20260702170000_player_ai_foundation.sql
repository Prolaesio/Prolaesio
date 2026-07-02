-- Player AI conversation, message, and usage foundation.

CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  model_used TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL DEFAULT current_date,
  tier TEXT NOT NULL DEFAULT 'free',
  model_used TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  request_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_conversations_user_id_updated_at_idx
  ON public.ai_conversations (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS ai_messages_conversation_id_created_at_idx
  ON public.ai_messages (conversation_id, created_at);

CREATE INDEX IF NOT EXISTS ai_messages_user_id_created_at_idx
  ON public.ai_messages (user_id, created_at);

CREATE INDEX IF NOT EXISTS ai_usage_user_id_usage_date_idx
  ON public.ai_usage (user_id, usage_date);

CREATE INDEX IF NOT EXISTS ai_usage_user_id_model_used_usage_date_idx
  ON public.ai_usage (user_id, model_used, usage_date);

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
      WHERE tgname = 'set_updated_at_ai_conversations'
    ) THEN
      CREATE TRIGGER set_updated_at_ai_conversations
        BEFORE UPDATE ON public.ai_conversations
        FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
    END IF;
  END IF;
END;
$$;

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ai_conversations'
      AND policyname = 'Users can view own AI conversations'
  ) THEN
    CREATE POLICY "Users can view own AI conversations"
      ON public.ai_conversations
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
      AND tablename = 'ai_conversations'
      AND policyname = 'Users can insert own AI conversations'
  ) THEN
    CREATE POLICY "Users can insert own AI conversations"
      ON public.ai_conversations
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ai_conversations'
      AND policyname = 'Users can update own AI conversations'
  ) THEN
    CREATE POLICY "Users can update own AI conversations"
      ON public.ai_conversations
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ai_messages'
      AND policyname = 'Users can view own AI messages'
  ) THEN
    CREATE POLICY "Users can view own AI messages"
      ON public.ai_messages
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
      AND tablename = 'ai_messages'
      AND policyname = 'Users can insert own AI messages'
  ) THEN
    CREATE POLICY "Users can insert own AI messages"
      ON public.ai_messages
      FOR INSERT
      TO authenticated
      WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
          SELECT 1
          FROM public.ai_conversations c
          WHERE c.id = conversation_id
            AND c.user_id = auth.uid()
        )
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ai_usage'
      AND policyname = 'Users can view own AI usage'
  ) THEN
    CREATE POLICY "Users can view own AI usage"
      ON public.ai_usage
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
      AND tablename = 'ai_usage'
      AND policyname = 'Users can insert own AI usage'
  ) THEN
    CREATE POLICY "Users can insert own AI usage"
      ON public.ai_usage
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END;
$$;

