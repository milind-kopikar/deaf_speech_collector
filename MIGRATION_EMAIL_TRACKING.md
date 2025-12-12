# Email-Based User Tracking - Migration Guide

## Overview
This migration adds email-based user tracking with automatic lowercase normalization to ensure consistency.

## What Changed

### Database Changes
- Added triggers to automatically convert `user_id` fields to lowercase in:
  - `recordings` table
  - `user_progress` table
- Existing data is normalized to lowercase

### Frontend Changes
- New email entry screen on home page (index.html)
- User progress display showing:
  - Total recordings
  - Stories started
  - Stories completed
- Email is stored in sessionStorage and used as `user_id`
- Recorder page requires email entry before access

### Backend Changes
- New API endpoint: `GET /api/users/:email/progress`
- Returns user statistics and per-story progress
- Email is automatically normalized to lowercase

## Migration Steps

### 1. Apply Database Migration

Run the migration script to add email normalization:

```bash
# Connect to your PostgreSQL database
psql -U your_username -d konkani_collector

# Run the migration
\i sql/migrations/001_add_email_constraint.sql
```

Or using node:
```bash
node -e "require('dotenv').config(); const {query} = require('./backend/db'); const fs = require('fs'); const sql = fs.readFileSync('./sql/migrations/001_add_email_constraint.sql', 'utf8'); query(sql).then(() => console.log('Migration complete!')).catch(console.error);"
```

### 2. Test the Changes

1. Start the server:
```bash
npm start
```

2. Visit http://localhost:3000
3. Enter an email address (it will be stored in lowercase)
4. Select a story and start recording
5. Return to home page - your email and progress should be remembered

### 3. Verify Migration

Check that emails are normalized:
```sql
-- All user_ids should be lowercase
SELECT DISTINCT user_id FROM recordings WHERE user_id != LOWER(user_id);
-- Should return 0 rows

SELECT DISTINCT user_id FROM user_progress WHERE user_id != LOWER(user_id);
-- Should return 0 rows
```

## Backward Compatibility

- Existing recordings with random `user_id` values (e.g., `user_1234567890_abc123`) will continue to work
- These will be normalized to lowercase automatically
- Users who enter emails with mixed case will have them stored as lowercase
- Users don't need to remember the exact capitalization they used

## API Changes

### New Endpoint
```http
GET /api/users/:email/progress
```

**Response:**
```json
{
  "email": "user@example.com",
  "total_recordings": 25,
  "unique_sentences": 20,
  "stories_started": 2,
  "stories_completed": 1,
  "last_activity": "2025-12-08T10:30:00Z",
  "is_new_user": false,
  "story_progress": [
    {
      "story_id": 1,
      "story_title": "पाव वाट",
      "total_sentences": 43,
      "sentences_recorded": 43,
      "completion_pct": 100.0,
      "last_recorded_at": "2025-12-08T10:30:00Z"
    }
  ]
}
```

## Session Storage

The app now uses:
- `userEmail` - stores the user's email address (lowercase)
- `selectedStoryId` - stores the currently selected story

Previous `userId` key is no longer used.

## Testing

Test email normalization:
```javascript
// All these should work identically:
sessionStorage.setItem('userEmail', 'Test@Example.COM');
sessionStorage.setItem('userEmail', 'test@example.com');
sessionStorage.setItem('userEmail', 'TEST@EXAMPLE.COM');

// All will be stored and used as: 'test@example.com'
```

## Rollback

To rollback this change:

```sql
-- Remove triggers
DROP TRIGGER IF EXISTS normalize_recordings_user_id ON recordings;
DROP TRIGGER IF EXISTS normalize_progress_user_id ON user_progress;
DROP FUNCTION IF EXISTS normalize_user_id();
```

Then revert frontend files to use random `userId` generation.
