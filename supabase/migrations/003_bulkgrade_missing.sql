-- ============================================================
-- Migration 003: Bulk grade sessions, missing submission alerts
-- Apply with: psql $DATABASE_URL -f migrations/003_bulkgrade_missing.sql
-- All changes are additive — no DROP, no destructive ALTER.
-- ============================================================

-- 1. Bulk grade sessions
--    Tracks which teacher is currently in a bulk grading session
--    and which submission they're currently reviewing.
CREATE TABLE IF NOT EXISTS bulkgrade_sessions (
  teacher_tg_id     BIGINT       PRIMARY KEY,
  group_id          UUID         NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  current_sub_id    INTEGER      REFERENCES submissions(id) ON DELETE SET NULL,
  graded_count      INTEGER      NOT NULL DEFAULT 0,
  skipped_count     INTEGER      NOT NULL DEFAULT 0,
  started_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  last_activity_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bulkgrade_sessions_activity
  ON bulkgrade_sessions (last_activity_at);

-- 2. Missing submission alerts
--    Tracks which (homework_id, student_id) pairs have had
--    the 48h "not submitted" alert sent to parents, so we
--    never double-send, and so we can send the follow-up
--    "now submitted" message when they do submit.
CREATE TABLE IF NOT EXISTS missing_submission_alerts (
  id              BIGSERIAL    PRIMARY KEY,
  homework_id     BIGINT       NOT NULL REFERENCES homeworks(id) ON DELETE CASCADE,
  student_id      UUID         NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  alerted_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  -- set when student eventually submits after the alert
  followup_sent_at TIMESTAMPTZ,
  UNIQUE (homework_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_missing_alerts_hw
  ON missing_submission_alerts (homework_id);

CREATE INDEX IF NOT EXISTS idx_missing_alerts_student
  ON missing_submission_alerts (student_id);