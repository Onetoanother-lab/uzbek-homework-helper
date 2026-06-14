-- ============================================================
-- Migration 002: Homework assignments, disputes, parent links,
--                error log
-- Apply with: psql $DATABASE_URL -f migrations/002_homework_disputes.sql
-- All changes are additive — no DROP, no destructive ALTER.
-- ============================================================

-- 1. Homework assignments
CREATE TABLE IF NOT EXISTS homeworks (
  id           BIGSERIAL    PRIMARY KEY,
  group_id     UUID         NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  created_by   BIGINT       NOT NULL,               -- teacher tg_user_id
  title        TEXT         NOT NULL,
  description  TEXT,
  file_id      TEXT,                                -- optional attachment
  file_type    TEXT,                                -- 'photo' | 'document'
  due_at       TIMESTAMPTZ  NOT NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  -- soft-delete so we don't break FK references
  deleted_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_homeworks_group
  ON homeworks (group_id, due_at);

CREATE INDEX IF NOT EXISTS idx_homeworks_due
  ON homeworks (due_at)
  WHERE deleted_at IS NULL;

-- 2. Track which reminder (24h / 1h) has already been sent
CREATE TABLE IF NOT EXISTS homework_reminders_sent (
  homework_id  BIGINT  NOT NULL REFERENCES homeworks(id) ON DELETE CASCADE,
  kind         TEXT    NOT NULL,  -- '24h' | '1h'
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (homework_id, kind)
);

-- 3. Student disputes
CREATE TABLE IF NOT EXISTS disputes (
  id            BIGSERIAL    PRIMARY KEY,
  submission_id INTEGER      NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  student_id    UUID         NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  reason        TEXT         NOT NULL,
  status        TEXT         NOT NULL DEFAULT 'open',  -- 'open' | 'resolved' | 'dismissed'
  resolver_tg_id BIGINT,
  resolution    TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  resolved_at   TIMESTAMPTZ,
  UNIQUE (submission_id)   -- one active dispute per submission
);

CREATE INDEX IF NOT EXISTS idx_disputes_status
  ON disputes (status, created_at);

-- 4. Parent ↔ student link (admin-managed)
CREATE TABLE IF NOT EXISTS parent_student_links (
  id          BIGSERIAL    PRIMARY KEY,
  parent_tg_id BIGINT      NOT NULL,
  student_id   UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  linked_by    BIGINT      NOT NULL,  -- admin tg_user_id
  linked_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (parent_tg_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_parent_student_parent
  ON parent_student_links (parent_tg_id);

-- 5. Error log (ring-buffer — keep last 500 rows via a trigger)
CREATE TABLE IF NOT EXISTS error_log (
  id         BIGSERIAL    PRIMARY KEY,
  context    TEXT         NOT NULL,  -- e.g. 'dispatch', 'weekly-report'
  message    TEXT         NOT NULL,
  stack      TEXT,
  update_id  INTEGER,                -- Telegram update_id if applicable
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_error_log_time
  ON error_log (created_at DESC);

-- Auto-prune: keep only newest 500 rows
CREATE OR REPLACE FUNCTION prune_error_log() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM error_log
  WHERE id IN (
    SELECT id FROM error_log
    ORDER BY created_at DESC
    OFFSET 500
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_prune_error_log ON error_log;
CREATE TRIGGER trg_prune_error_log
  AFTER INSERT ON error_log
  FOR EACH ROW EXECUTE FUNCTION prune_error_log();