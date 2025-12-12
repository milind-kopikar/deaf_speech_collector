-- Deaf Speech Collector Database Schema
-- PostgreSQL 14+
-- Supporting UN SDG Goal 3: Good Health and Well-Being
-- Collecting deaf speech recordings in Marathi for ASR fine-tuning

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Stories table (Marathi stories)
CREATE TABLE stories (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    source_file TEXT,           -- Original .txt filename
    language TEXT DEFAULT 'marathi',
    total_sentences INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_stories_title ON stories(title);
CREATE INDEX idx_stories_created ON stories(created_at DESC);

-- Sentences table (Marathi sentences from stories)
CREATE TABLE sentences (
    id SERIAL PRIMARY KEY,
    story_id INT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    order_in_story INT NOT NULL,     -- Position in story (1, 2, 3...)
    text_devanagari TEXT NOT NULL,   -- मराठी (Marathi in Devanagari script)
    text_iast TEXT,                  -- Romanized (IAST transliteration, optional)
    char_count INT,                  -- Character count for duration estimation
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(story_id, order_in_story)
);

CREATE INDEX idx_sentences_story ON sentences(story_id, order_in_story);
CREATE INDEX idx_sentences_text ON sentences(text_devanagari);

-- Recordings table
CREATE TABLE recordings (
    id SERIAL PRIMARY KEY,
    sentence_id INT NOT NULL REFERENCES sentences(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,              -- Session ID, phone number, or username
    audio_filepath TEXT NOT NULL,       -- uploads/xyz.wav or s3://bucket/xyz.wav
    file_size_bytes BIGINT,
    duration_seconds FLOAT,
    sample_rate INT DEFAULT 16000,
    channels INT DEFAULT 1,
    format TEXT DEFAULT 'wav',
    
    -- Validation tracking
    validation_status TEXT DEFAULT 'pending',  -- pending, passed, failed
    validation_errors JSONB,                   -- Array of error messages
    audio_metadata JSONB,                      -- Full ffprobe output
    
    -- Recording status
    status TEXT DEFAULT 'pending',      -- pending, approved, rejected
    reviewed_by TEXT,
    reviewed_at TIMESTAMPTZ,
    rejection_reason TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_recordings_sentence ON recordings(sentence_id);
CREATE INDEX idx_recordings_user ON recordings(user_id);
CREATE INDEX idx_recordings_status ON recordings(status);
CREATE INDEX idx_recordings_validation ON recordings(validation_status);
CREATE INDEX idx_recordings_created ON recordings(created_at DESC);

-- User progress tracking (optional, for session management)
CREATE TABLE user_progress (
    user_id TEXT NOT NULL,
    story_id INT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    last_sentence_order INT DEFAULT 0,
    total_recorded INT DEFAULT 0,
    last_activity_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, story_id)
);

CREATE INDEX idx_progress_user ON user_progress(user_id);
CREATE INDEX idx_progress_story ON user_progress(story_id);

-- Recording statistics view
CREATE OR REPLACE VIEW recording_stats AS
SELECT
    s.id AS story_id,
    s.title AS story_title,
    COUNT(DISTINCT se.id) AS total_sentences,
    COUNT(DISTINCT r.id) AS total_recordings,
    COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'approved') AS approved_recordings,
    COUNT(DISTINCT r.sentence_id) AS sentences_with_recordings,
    ROUND(
        100.0 * COUNT(DISTINCT r.sentence_id) / NULLIF(COUNT(DISTINCT se.id), 0),
        1
    ) AS completion_percentage
FROM stories s
LEFT JOIN sentences se ON se.story_id = s.id
LEFT JOIN recordings r ON r.sentence_id = se.id
GROUP BY s.id, s.title;

-- Trigger to update story sentence count
CREATE OR REPLACE FUNCTION update_story_sentence_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE stories
    SET total_sentences = (
        SELECT COUNT(*) FROM sentences WHERE story_id = NEW.story_id
    ),
    updated_at = NOW()
    WHERE id = NEW.story_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_sentence_count
AFTER INSERT OR DELETE ON sentences
FOR EACH ROW
EXECUTE FUNCTION update_story_sentence_count();

-- Trigger to update user progress
CREATE OR REPLACE FUNCTION update_user_progress()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_progress (user_id, story_id, last_sentence_order, total_recorded, last_activity_at)
    SELECT
        NEW.user_id,
        se.story_id,
        se.order_in_story,
        1,
        NOW()
    FROM sentences se
    WHERE se.id = NEW.sentence_id
    ON CONFLICT (user_id, story_id)
    DO UPDATE SET
        last_sentence_order = GREATEST(user_progress.last_sentence_order, EXCLUDED.last_sentence_order),
        total_recorded = user_progress.total_recorded + 1,
        last_activity_at = NOW();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_progress
AFTER INSERT ON recordings
FOR EACH ROW
EXECUTE FUNCTION update_user_progress();

-- Comments
COMMENT ON TABLE stories IS 'Amchi Konkani stories for sentence collection';
COMMENT ON TABLE sentences IS 'Individual sentences extracted from stories';
COMMENT ON TABLE recordings IS 'Audio recordings of sentences by users';
COMMENT ON TABLE user_progress IS 'Track user recording progress per story';
COMMENT ON VIEW recording_stats IS 'Aggregate statistics for story completion';
