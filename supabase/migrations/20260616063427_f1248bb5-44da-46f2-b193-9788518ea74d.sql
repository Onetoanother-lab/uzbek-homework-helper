CREATE TABLE IF NOT EXISTS public.bulkgrade_sessions (
  teacher_tg_id BIGINT PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  current_sub_id BIGINT,
  graded_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.bulkgrade_sessions TO service_role;
ALTER TABLE public.bulkgrade_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.missing_submission_alerts (
  id BIGSERIAL PRIMARY KEY,
  homework_id BIGINT NOT NULL REFERENCES public.homeworks(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  alerted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  followup_sent_at TIMESTAMPTZ,
  UNIQUE (homework_id, student_id)
);
GRANT ALL ON public.missing_submission_alerts TO service_role;
ALTER TABLE public.missing_submission_alerts ENABLE ROW LEVEL SECURITY;