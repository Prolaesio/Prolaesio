-- Player AI history and favorites support.

ALTER TABLE public.ai_conversations
  ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS ai_conversations_user_id_is_favorite_updated_at_idx
  ON public.ai_conversations (user_id, is_favorite, updated_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ai_conversations'
      AND policyname = 'Users can delete own AI conversations'
  ) THEN
    CREATE POLICY "Users can delete own AI conversations"
      ON public.ai_conversations
      FOR DELETE
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END;
$$;

