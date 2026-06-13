
CREATE TABLE public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  parents_chat_id bigint,
  teachers_chat_id bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.groups TO service_role;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_user_id bigint UNIQUE NOT NULL,
  full_name text NOT NULL,
  group_id uuid REFERENCES public.groups(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.students TO service_role;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.submissions (
  id bigserial PRIMARY KEY,
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.groups(id),
  file_id text NOT NULL,
  file_type text NOT NULL CHECK (file_type IN ('photo','document')),
  caption text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewed')),
  ai_draft_grade text,
  ai_draft_feedback text,
  final_grade text,
  final_feedback text,
  reviewer_tg_id bigint,
  teacher_chat_id bigint,
  teacher_message_id bigint,
  pending_grade text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);
GRANT ALL ON public.submissions TO service_role;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_submissions_student ON public.submissions(student_id);
CREATE INDEX idx_submissions_status ON public.submissions(status);

CREATE TABLE public.conversation_state (
  tg_user_id bigint PRIMARY KEY,
  step text NOT NULL,
  draft jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.conversation_state TO service_role;
ALTER TABLE public.conversation_state ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.admins (
  tg_user_id bigint PRIMARY KEY,
  added_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.admins TO service_role;
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.teachers_chats (
  chat_id bigint PRIMARY KEY,
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.teachers_chats TO service_role;
ALTER TABLE public.teachers_chats ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.processed_updates (
  update_id bigint PRIMARY KEY,
  processed_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.processed_updates TO service_role;
ALTER TABLE public.processed_updates ENABLE ROW LEVEL SECURITY;
