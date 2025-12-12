-- Migration: Add lowercase constraint for user_id (email) fields
-- This ensures email addresses are always stored in lowercase for consistency

-- Add a function to normalize user_id to lowercase
CREATE OR REPLACE FUNCTION normalize_user_id()
RETURNS TRIGGER AS $$
BEGIN
    NEW.user_id = LOWER(TRIM(NEW.user_id));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to recordings table
DROP TRIGGER IF EXISTS normalize_recordings_user_id ON recordings;
CREATE TRIGGER normalize_recordings_user_id
    BEFORE INSERT OR UPDATE ON recordings
    FOR EACH ROW
    EXECUTE FUNCTION normalize_user_id();

-- Add trigger to user_progress table
DROP TRIGGER IF EXISTS normalize_progress_user_id ON user_progress;
CREATE TRIGGER normalize_progress_user_id
    BEFORE INSERT OR UPDATE ON user_progress
    FOR EACH ROW
    EXECUTE FUNCTION normalize_user_id();

-- Normalize existing data
UPDATE recordings SET user_id = LOWER(TRIM(user_id)) WHERE user_id != LOWER(TRIM(user_id));
UPDATE user_progress SET user_id = LOWER(TRIM(user_id)) WHERE user_id != LOWER(TRIM(user_id));
