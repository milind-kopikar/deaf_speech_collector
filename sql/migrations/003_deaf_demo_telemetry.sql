-- Migration 003: Deaf Speech ASR live-demo telemetry
--
-- Creates three tables to capture data from the `/demo/live` page in
-- webapp-deaf:
--   1. deaf_demo_feedback — per-transcription quality data (thumbs, edits,
--      tts_choice, audio link) for future model training and post-processor
--      tuning. One row per recording.
--   2. deaf_demo_events  — raw event stream (clicks) for product
--      analytics. One row per user interaction.
--   3. deaf_user_survey  — 1-to-5 NPS-style survey responses captured
--      via /demo/live/survey. One row per submission.
--
-- The R2 object key for the WAV is the feedback row's UUID (`<id>.wav`),
-- enforcing a strict 1:1 mapping with no orphan possibilities.
--
-- Apply with: `psql $DATABASE_URL -f sql/migrations/003_deaf_demo_telemetry.sql`

BEGIN;

-- Shared trigger function for updated_at maintenance. Idempotent.
CREATE OR REPLACE FUNCTION asr_feedback_set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 1. Per-transcription quality data ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS deaf_demo_feedback (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- R2 link — 1:1 with this row; object key is `<id>.wav`.
    audio_url           TEXT,
    audio_bytes         INTEGER,
    audio_duration_ms   INTEGER,

    -- What RunPod returned.
    raw_text            TEXT NOT NULL,
    corrected_text      TEXT NOT NULL,
    postprocess_mode    TEXT,
    latency_asr_ms      INTEGER,
    latency_pp_ms       INTEGER,

    -- What the user did (NULL = untouched).
    edited_raw          TEXT,
    edited_corrected    TEXT,
    thumb_raw           TEXT CHECK (thumb_raw IN ('up','down') OR thumb_raw IS NULL),
    thumb_corrected     TEXT CHECK (thumb_corrected IN ('up','down') OR thumb_corrected IS NULL),
    tts_choice          TEXT CHECK (tts_choice IN ('raw','corrected') OR tts_choice IS NULL),
    tts_language        TEXT,

    user_agent          TEXT,
    session_id          TEXT NOT NULL
);

DROP TRIGGER IF EXISTS deaf_feedback_updated_at ON deaf_demo_feedback;
CREATE TRIGGER deaf_feedback_updated_at
    BEFORE UPDATE ON deaf_demo_feedback
    FOR EACH ROW EXECUTE FUNCTION asr_feedback_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_deaf_feedback_session
    ON deaf_demo_feedback(session_id);
CREATE INDEX IF NOT EXISTS idx_deaf_feedback_created
    ON deaf_demo_feedback(created_at DESC);

-- ── 2. Raw event stream (product metrics) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS deaf_demo_events (
    id              BIGSERIAL PRIMARY KEY,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    session_id      TEXT NOT NULL,
    feedback_id     UUID REFERENCES deaf_demo_feedback(id) ON DELETE SET NULL,

    -- Allowed event types. Extending this list requires a migration.
    event_type      TEXT NOT NULL CHECK (event_type IN (
        'record_click',
        'transcribe_click',
        'thumb_click',
        'tts_click',
        'edit_blur',
        'survey_link_click',
        'survey_submit'
    )),
    -- Free-form payload: e.g., 'raw' / 'corrected' / 'marathi' / 'english'.
    event_target    TEXT,
    -- e.g., 'up' / 'down' for thumb_click; length of edited text for edit_blur.
    event_value     TEXT,
    user_agent      TEXT
);

CREATE INDEX IF NOT EXISTS idx_deaf_events_session
    ON deaf_demo_events(session_id);
CREATE INDEX IF NOT EXISTS idx_deaf_events_type_created
    ON deaf_demo_events(event_type, created_at DESC);

-- ── 3. NPS-style user survey responses ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS deaf_user_survey (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    session_id      TEXT NOT NULL,
    -- Q1: How likely will a reader understand what you said, from the transcription?
    q1_clarity      SMALLINT NOT NULL CHECK (q1_clarity BETWEEN 1 AND 5),
    -- Q2: How likely are you to use this app for transcribing Deaf Speech?
    q2_likelihood   SMALLINT NOT NULL CHECK (q2_likelihood BETWEEN 1 AND 5),
    comments        TEXT,
    user_agent      TEXT
);

CREATE INDEX IF NOT EXISTS idx_deaf_survey_created
    ON deaf_user_survey(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deaf_survey_session
    ON deaf_user_survey(session_id);

COMMIT;
