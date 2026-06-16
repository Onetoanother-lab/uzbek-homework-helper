ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS homework_id BIGINT REFERENCES public.homeworks(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_submissions_homework ON public.submissions(homework_id);
CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON public.submissions(created_at DESC);