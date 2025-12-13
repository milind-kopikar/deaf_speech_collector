# Cleanup Deleted Recordings

## Overview

This system allows you to mark recordings for deletion through the Quality Check interface and then permanently remove them in batch using a cleanup script.

## How It Works

### 1. Mark Recordings for Deletion (Web UI)

1. Navigate to the **Review Recordings** page (`/review.html`)
2. For each recording you want to delete:
   - Listen to the audio
   - Set the Quality Check dropdown to **"Delete"**
   - The recording will be marked with `status='deleted'` in the database
   - The dropdown will show a gray strikethrough style

### 2. Filter Deleted Recordings

- Use the Filter dropdown and select **"Marked for Deletion"**
- This shows only recordings marked for deletion
- Review the list before running cleanup

### 3. Run Cleanup Script

The cleanup script permanently deletes recordings marked as "deleted" from both:
- **R2 Storage** (audio files)
- **PostgreSQL Database** (recording entries)

#### Local Testing

```bash
npm run cleanup-deleted
```

#### On Railway

```bash
railway run npm run cleanup-deleted
```

Or use Railway's web shell:
1. Go to your Railway project
2. Click on the service
3. Go to "Shell" tab
4. Run: `npm run cleanup-deleted`

## What Gets Deleted

For each recording with `status='deleted'`:

1. **R2 Storage**: Deletes the audio file (e.g., `deaf_speech/recordings/1234-xyz.wav`)
2. **Database**: Removes the row from the `recordings` table

## Safety Features

- Only deletes recordings explicitly marked as 'deleted'
- Shows detailed progress for each deletion
- Continues even if storage file is already missing
- Provides summary of successful/failed deletions
- Does NOT delete recordings with other statuses (pending, approved, rejected)

## Example Output

```
🗑️  Starting cleanup of deleted recordings...

📊 Found 3 recording(s) marked for deletion:

   Processing ID 42: deaf_speech/recordings/1234-test.wav
      ✓ Deleted from R2: deaf_speech/recordings/1234-test.wav
      ✓ Deleted from database: ID 42

   Processing ID 43: deaf_speech/recordings/5678-test.wav
      ✓ Deleted from R2: deaf_speech/recordings/5678-test.wav
      ✓ Deleted from database: ID 43

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📈 Cleanup Summary:
   ✅ Successfully deleted: 2

✨ Cleanup complete!
```

## Recommended Workflow

1. **During Development/Testing**:
   - Mark test recordings as "Delete" after each test session
   - Run cleanup weekly or before significant milestones

2. **During Production**:
   - Mark poor quality recordings as "Rejected" (for re-recording)
   - Mark duplicates/accidental recordings as "Delete"
   - Run cleanup monthly to save storage costs
   - Review "Marked for Deletion" filter before running cleanup

## Storage Cost Savings

- R2 charges ~$0.015/GB/month for storage
- Average WAV recording: ~500KB
- Cleaning up 1000 recordings saves ~$0.0075/month
- Over time, orphaned files can accumulate and increase costs

## Troubleshooting

### "No recordings marked for deletion found"
- No recordings have `status='deleted'`
- Check the Review page and mark some recordings first

### Storage delete fails but database delete succeeds
- The audio file may have already been manually deleted
- The script continues and removes the database entry
- This is expected behavior (not an error)

### Database connection error
- Ensure `DATABASE_URL` environment variable is set
- On Railway: Variable is automatically set
- Local: Copy from Railway or use local database

## Related Scripts

- `clear-test-recordings.js` - Deletes ALL recordings (use with caution!)
- `delete-recordings.js` - Delete specific recordings by ID
- `cleanup-deleted-recordings.js` - This script (batch delete marked recordings)
