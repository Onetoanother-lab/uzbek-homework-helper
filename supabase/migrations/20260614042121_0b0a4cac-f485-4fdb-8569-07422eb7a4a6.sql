
CREATE TABLE IF NOT EXISTS public.weekly_reports (
  id bigserial PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, week_start)
);
GRANT ALL ON public.weekly_reports TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.weekly_reports_id_seq TO service_role;
ALTER TABLE public.weekly_reports ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.submission_rate_limits (
  id bigserial PRIMARY KEY,
  tg_user_id bigint NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS submission_rate_limits_user_time_idx
  ON public.submission_rate_limits (tg_user_id, submitted_at DESC);
GRANT ALL ON public.submission_rate_limits TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.submission_rate_limits_id_seq TO service_role;
ALTER TABLE public.submission_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.review_edits (
  id bigserial PRIMARY KEY,
  submission_id bigint NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  editor_tg_id bigint NOT NULL,
  old_grade text,
  new_grade text,
  old_feedback text,
  new_feedback text,
  edited_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.review_edits TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.review_edits_id_seq TO service_role;
ALTER TABLE public.review_edits ENABLE ROW LEVEL SECURITY;
