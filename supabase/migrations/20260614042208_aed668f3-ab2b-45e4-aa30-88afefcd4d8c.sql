
ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS resubmit_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_resubmit_at timestamptz;
