-- Add needs_rerecording column to recordings table
-- This allows reviewers to flag recordings that need to be redone

ALTER TABLE recordings 
ADD COLUMN IF NOT EXISTS needs_rerecording BOOLEAN DEFAULT FALSE;

-- Add index for filtering
CREATE INDEX IF NOT EXISTS idx_recordings_needs_rerecording 
ON recordings(needs_rerecording) 
WHERE needs_rerecording = TRUE;

-- Add comment
COMMENT ON COLUMN recordings.needs_rerecording IS 'Flag indicating if recording needs to be redone based on quality review';
