CREATE TABLE IF NOT EXISTS public.homeworks (
  id BIGSERIAL PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  created_by BIGINT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  file_id TEXT,
  file_type TEXT,
  due_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
GRANT ALL ON public.homeworks TO service_role;
ALTER TABLE public.homeworks ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_homeworks_group ON public.homeworks (group_id, due_at);
CREATE INDEX IF NOT EXISTS idx_homeworks_due ON public.homeworks (due_at) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.homework_reminders_sent (
  homework_id BIGINT NOT NULL REFERENCES public.homeworks(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (homework_id, kind)
);
GRANT ALL ON public.homework_reminders_sent TO service_role;
ALTER TABLE public.homework_reminders_sent ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.disputes (
  id BIGSERIAL PRIMARY KEY,
  submission_id BIGINT NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  resolver_tg_id BIGINT,
  resolution TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  UNIQUE (submission_id)
);
GRANT ALL ON public.disputes TO service_role;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_disputes_status ON public.disputes (status, created_at);

CREATE TABLE IF NOT EXISTS public.parent_student_links (
  id BIGSERIAL PRIMARY KEY,
  parent_tg_id BIGINT NOT NULL,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  linked_by BIGINT NOT NULL,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (parent_tg_id, student_id)
);
GRANT ALL ON public.parent_student_links TO service_role;
ALTER TABLE public.parent_student_links ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_parent_student_parent ON public.parent_student_links (parent_tg_id);

CREATE TABLE IF NOT EXISTS public.error_log (
  id BIGSERIAL PRIMARY KEY,
  context TEXT NOT NULL,
  message TEXT NOT NULL,
  stack TEXT,
  update_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.error_log TO service_role;
ALTER TABLE public.error_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_error_log_time ON public.error_log (created_at DESC);

CREATE TABLE IF NOT EXISTS public.bot_events (
  id BIGSERIAL PRIMARY KEY,
  update_id BIGINT,
  chat_id BIGINT,
  chat_type TEXT,
  from_user_id BIGINT,
  command TEXT,
  event_type TEXT NOT NULL,
  message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.bot_events TO service_role;
ALTER TABLE public.bot_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_bot_events_time ON public.bot_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_events_update ON public.bot_events (update_id);

CREATE OR REPLACE FUNCTION public.prune_error_log()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.error_log
  WHERE id IN (
    SELECT id FROM public.error_log
    ORDER BY created_at DESC
    OFFSET 500
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_prune_error_log ON public.error_log;
CREATE TRIGGER trg_prune_error_log
AFTER INSERT ON public.error_log
FOR EACH ROW EXECUTE FUNCTION public.prune_error_log();

CREATE OR REPLACE FUNCTION public.prune_bot_events()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.bot_events
  WHERE id IN (
    SELECT id FROM public.bot_events
    ORDER BY created_at DESC
    OFFSET 1000
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_prune_bot_events ON public.bot_events;
CREATE TRIGGER trg_prune_bot_events
AFTER INSERT ON public.bot_events
FOR EACH ROW EXECUTE FUNCTION public.prune_bot_events();