CREATE TABLE IF NOT EXISTS public.beta_waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  age TEXT,
  country TEXT,
  level TEXT,
  reason TEXT,
  status TEXT DEFAULT 'pending'
);
ALTER TABLE public.beta_waitlist ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'beta_waitlist'
      AND indexname = 'beta_waitlist_email_lower_unique'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.beta_waitlist
      GROUP BY lower(email)
      HAVING count(*) > 1
    ) THEN
      CREATE UNIQUE INDEX beta_waitlist_email_lower_unique
        ON public.beta_waitlist (lower(email));
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'beta_waitlist'
      AND policyname = 'Anyone can join beta waitlist'
  ) THEN
    CREATE POLICY "Anyone can join beta waitlist"
      ON public.beta_waitlist
      FOR INSERT
      TO anon, authenticated
      WITH CHECK (
        length(btrim(name)) > 0
        AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
        AND role IN ('Player', 'Coach')
      );
  END IF;
END;
$$;
GRANT INSERT ON public.beta_waitlist TO anon, authenticated;
