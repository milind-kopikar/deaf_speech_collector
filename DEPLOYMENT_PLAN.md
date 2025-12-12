# Konkani Collector - Railway & Cloudflare R2 Deployment Plan

## Overview
This document outlines the step-by-step migration from local development (localhost + local PostgreSQL + local file storage) to production (Railway + Railway PostgreSQL + Cloudflare R2).

---

## Pre-Deployment Checklist

### Local Testing Verification
- [ ] All recordings work end-to-end locally
- [ ] Review page displays recordings correctly
- [ ] Previous/Next navigation works
- [ ] Re-recording deletes old files and uploads new ones
- [ ] Email-based user tracking works
- [ ] User progress displays correctly
- [ ] Audio playback works in review page
- [ ] No console errors in browser

---

## Phase 1: Database Migration (Railway PostgreSQL)

### 1.1 Setup Railway PostgreSQL
**Steps:**
1. Create new Railway project: `konkani-collector`
2. Add PostgreSQL service to project
3. Note down connection details:
   - `DATABASE_URL` (full connection string)
   - Host, Port, Database name, Username, Password

**Testing:**
```bash
# Test connection from local machine
psql $DATABASE_URL
```

### 1.2 Create Database Schema
**Steps:**
1. Export local schema:
   ```bash
   pg_dump -U konkani_user -d konkani_collector --schema-only > schema_export.sql
   ```

2. Import to Railway PostgreSQL:
   ```bash
   psql $RAILWAY_DATABASE_URL -f sql/schema.sql
   ```

3. Run migrations:
   ```bash
   psql $RAILWAY_DATABASE_URL -f sql/migrations/001_add_email_constraint.sql
   psql $RAILWAY_DATABASE_URL -f sql/migrations/002_add_needs_rerecording.sql
   ```

**Verification:**
```sql
-- Check tables exist
\dt

-- Check recordings table structure
\d recordings

-- Verify columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'recordings';

-- Check triggers exist
SELECT trigger_name, event_manipulation, event_object_table 
FROM information_schema.triggers 
WHERE event_object_table IN ('recordings', 'user_progress');
```

**Expected Results:**
- Tables: `stories`, `sentences`, `recordings`, `user_progress`
- `recordings` has `needs_rerecording` column
- Triggers: `normalize_recordings_user_id`, `normalize_progress_user_id`

### 1.3 Import Sample Data
**Steps:**
1. Export stories and sentences from local:
   ```bash
   pg_dump -U konkani_user -d konkani_collector \
     --data-only \
     --table=stories \
     --table=sentences \
     > data_export.sql
   ```

2. Import to Railway:
   ```bash
   psql $RAILWAY_DATABASE_URL -f data_export.sql
   ```

**Verification:**
```sql
-- Check data imported
SELECT COUNT(*) FROM stories;  -- Should be 2
SELECT COUNT(*) FROM sentences;  -- Should be 86 (43 per story)

-- Verify story details
SELECT id, title, total_sentences FROM stories;

-- Check sample sentences
SELECT id, order_in_story, text_devanagari 
FROM sentences 
WHERE story_id = 1 
LIMIT 3;
```

### 1.4 Test Database Connection from Local App
**Steps:**
1. Update local `.env`:
   ```env
   DATABASE_URL=<RAILWAY_DATABASE_URL>
   ```

2. Restart server:
   ```bash
   npm run dev
   ```

3. Test endpoints:
   ```bash
   # Test stories endpoint
   curl http://localhost:3000/api/stories

   # Test sentences endpoint
   curl http://localhost:3000/api/sentences/1/next?userId=test@test.com
   ```

**Verification Checklist:**
- [ ] Server connects to Railway DB without errors
- [ ] Stories API returns 2 stories
- [ ] Sentences API returns sentences with Devanagari text
- [ ] No database connection errors in logs

**Rollback Plan:**
- Revert `.env` to local `DATABASE_URL`
- Railway DB remains intact for retry

---

## Phase 2: Cloudflare R2 Storage Setup

### 2.1 Create R2 Bucket
**Steps:**
1. Go to Cloudflare Dashboard → R2
2. Create bucket: `konkani-recordings`
3. Note down:
   - Account ID
   - Bucket name
   - Endpoint URL

### 2.2 Create R2 API Token
**Steps:**
1. Go to R2 → Manage R2 API Tokens
2. Create token with permissions:
   - Object Read & Write
   - Scope: `konkani-recordings` bucket only
3. Save credentials:
   - Access Key ID
   - Secret Access Key

### 2.3 Install R2 Dependencies
**Steps:**
```bash
npm install @aws-sdk/client-s3 @aws-sdk/lib-storage
```

### 2.4 Create R2 Storage Module
**File: `backend/storage/r2Storage.js`**

```javascript
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const fs = require('fs').promises;

class R2Storage {
    constructor() {
        this.client = new S3Client({
            region: 'auto',
            endpoint: process.env.R2_ENDPOINT,
            credentials: {
                accessKeyId: process.env.R2_ACCESS_KEY_ID,
                secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
            }
        });
        this.bucket = process.env.R2_BUCKET_NAME;
    }

    async uploadFile(localPath, key) {
        const fileStream = await fs.readFile(localPath);
        
        const upload = new Upload({
            client: this.client,
            params: {
                Bucket: this.bucket,
                Key: key,
                Body: fileStream,
                ContentType: 'audio/wav'
            }
        });

        await upload.done();
        return key;
    }

    async getFileStream(key) {
        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: key
        });
        
        const response = await this.client.send(command);
        return response.Body;
    }

    async deleteFile(key) {
        const command = new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: key
        });
        
        await this.client.send(command);
    }

    getPublicUrl(key) {
        // R2 public URL format (if bucket is public)
        return `${process.env.R2_PUBLIC_URL}/${key}`;
    }
}

module.exports = R2Storage;
```

### 2.5 Update Storage Factory
**File: `backend/storage/index.js`**

```javascript
const LocalStorage = require('./localStorage');
const R2Storage = require('./r2Storage');

function getStorage() {
    const storageType = process.env.STORAGE_TYPE || 'local';
    
    switch (storageType) {
        case 'r2':
            return new R2Storage();
        case 'local':
        default:
            return new LocalStorage();
    }
}

module.exports = getStorage();
```

### 2.6 Test R2 Upload from Local
**Steps:**
1. Update local `.env`:
   ```env
   STORAGE_TYPE=r2
   R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
   R2_ACCESS_KEY_ID=<your-access-key>
   R2_SECRET_ACCESS_KEY=<your-secret-key>
   R2_BUCKET_NAME=konkani-recordings
   R2_PUBLIC_URL=https://<bucket>.r2.dev  # or custom domain
   ```

2. Restart server and test upload:
   - Go to `http://localhost:3000`
   - Enter email
   - Select story
   - Record a test sentence
   - Submit

**Verification:**
- [ ] Recording uploads without errors
- [ ] Check Cloudflare R2 Dashboard → `konkani-recordings` bucket
- [ ] File appears with correct path: `recordings/<user>_<sentence>_<uuid>.wav`
- [ ] Database `audio_filepath` column contains R2 key
- [ ] Download file from R2 and verify it plays

**Testing Playback:**
1. Go to review page: `http://localhost:3000/review.html`
2. Check if audio player works with R2 URLs

### 2.7 Update Audio Serving for R2
**File: `backend/routes/recordings.js`**

Update `GET /:id/audio` endpoint:

```javascript
// GET /api/recordings/:id/audio - Get audio file for a recording
router.get('/:id/audio', async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await query(
            'SELECT audio_filepath FROM recordings WHERE id = $1',
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Recording not found' });
        }
        
        const audioKey = result.rows[0].audio_filepath;
        
        if (process.env.STORAGE_TYPE === 'r2') {
            // Stream from R2
            const storage = require('../storage');
            const stream = await storage.getFileStream(audioKey);
            
            res.set({
                'Content-Type': 'audio/wav',
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'public, max-age=31536000'
            });
            
            stream.pipe(res);
        } else {
            // Local file serving (existing code)
            const audioPath = path.join(__dirname, '../../uploads', audioKey);
            
            if (!require('fs').existsSync(audioPath)) {
                return res.status(404).json({ error: 'Audio file not found' });
            }
            
            const stat = require('fs').statSync(audioPath);
            res.set({
                'Content-Type': 'audio/wav',
                'Content-Length': stat.size,
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'no-cache'
            });
            
            res.sendFile(audioPath);
        }
        
    } catch (error) {
        console.error('Error fetching audio:', error);
        res.status(500).json({ error: 'Failed to fetch audio' });
    }
});
```

**Verification:**
- [ ] Record new sentence with R2 enabled
- [ ] Play recording in recorder page (after recording)
- [ ] Navigate to review page and play recording
- [ ] Audio streams correctly from R2
- [ ] No CORS errors in browser console

**Rollback Plan:**
- Set `STORAGE_TYPE=local` in `.env`
- Existing local recordings still work

---

## Phase 3: Deploy Application to Railway

### 3.1 Prepare for Deployment
**Steps:**

1. Create `railway.json` (Railway configuration):
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

2. Update `package.json` scripts:
```json
{
  "scripts": {
    "start": "node backend/server.js",
    "dev": "nodemon backend/server.js"
  }
}
```

3. Create `.railwayignore`:
```
node_modules/
.env
.git/
uploads/
asr_export_test/
*.log
.vscode/
```

4. Verify `package.json` includes all dependencies:
```bash
npm install --save @aws-sdk/client-s3 @aws-sdk/lib-storage
```

### 3.2 Deploy to Railway
**Steps:**

1. Install Railway CLI (optional):
```bash
npm install -g @railway/cli
railway login
```

2. Link project:
```bash
railway link
```

3. Set environment variables in Railway Dashboard:
```env
NODE_ENV=production
PORT=3000

# Database (auto-provided by Railway PostgreSQL service)
DATABASE_URL=${{Postgres.DATABASE_URL}}

# R2 Storage
STORAGE_TYPE=r2
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=<your-access-key>
R2_SECRET_ACCESS_KEY=<your-secret-key>
R2_BUCKET_NAME=konkani-recordings
R2_PUBLIC_URL=https://<bucket>.r2.dev

# Audio settings
REQUIRED_SAMPLE_RATE=16000
REQUIRED_CHANNELS=1
REQUIRED_FORMAT=wav
MAX_FILE_SIZE_MB=10

# Features
ENABLE_TEST_ENDPOINTS=false
ENABLE_CORS=true
```

4. Deploy via Git:
```bash
git push railway main
```

Or use CLI:
```bash
railway up
```

**Deployment Logs:**
Monitor deployment in Railway dashboard or CLI:
```bash
railway logs
```

### 3.3 Post-Deployment Verification

**Health Check:**
```bash
# Get your Railway URL from dashboard
RAILWAY_URL=https://konkani-collector-production.up.railway.app

# Test health endpoint
curl $RAILWAY_URL/health
# Expected: {"status":"ok","timestamp":"...","uptime":...}
```

**API Endpoints Test:**
```bash
# Test stories API
curl $RAILWAY_URL/api/stories
# Expected: {"stories":[...]} with 2 stories

# Test sentences API
curl "$RAILWAY_URL/api/sentences/1/next?userId=test@example.com"
# Expected: {sentence_id, text_devanagari, ...}

# Test recordings API (should be empty initially)
curl $RAILWAY_URL/api/recordings
# Expected: []
```

**Browser Testing:**
1. Open `$RAILWAY_URL` in browser
2. Enter email address
3. Should see stories with 0% completion

**Verification Checklist:**
- [ ] Health endpoint returns 200 OK
- [ ] Stories API returns correct data
- [ ] Sentences API returns sentences
- [ ] No 500 errors in Railway logs
- [ ] Database connection successful
- [ ] Static files (CSS, JS) load correctly

---

## Phase 4: End-to-End Recording Test

### 4.1 Test Recording Flow
**Steps:**

1. Open Railway app in browser: `$RAILWAY_URL`
2. Enter email: `test@example.com`
3. Click "Start Recording" on Story 1
4. Record sentence 1
5. Click Play - verify audio plays back
6. Click Submit & Next
7. Record sentence 2
8. Submit
9. Click "End Recording Session"

**Verification Checklist:**
- [ ] Email entry works
- [ ] Story selection loads recorder page
- [ ] Sentence displays in Devanagari
- [ ] Microphone permission granted
- [ ] Recording starts/stops correctly
- [ ] Audio visualizer shows during recording
- [ ] Play button works after recording
- [ ] Submit uploads to R2 successfully
- [ ] Next sentence loads
- [ ] No errors in browser console
- [ ] No errors in Railway logs

**Check R2 Storage:**
- Go to Cloudflare R2 Dashboard
- Check `konkani-recordings` bucket
- Verify 2 files uploaded with correct naming pattern
- Download and play files locally to verify

**Check Database:**
```bash
railway run psql $DATABASE_URL
```

```sql
-- Check recordings were saved
SELECT 
    r.id, 
    r.user_id, 
    r.audio_filepath, 
    r.duration_seconds,
    s.text_devanagari
FROM recordings r
JOIN sentences s ON r.sentence_id = s.id;

-- Should show 2 recordings with test@example.com
```

### 4.2 Test Review Page
**Steps:**

1. Go to `$RAILWAY_URL/review.html`
2. Should see 2 recordings in table
3. Click play on each recording
4. Change quality dropdown to "Needs Re-recording"

**Verification Checklist:**
- [ ] Review page loads
- [ ] Table shows 2 recordings
- [ ] Email is masked: `t**t@example.com`
- [ ] Story title displays correctly
- [ ] Devanagari text displays correctly
- [ ] Audio players work (stream from R2)
- [ ] Quality dropdown changes save
- [ ] Stats update (Needs Re-recording count)
- [ ] Filter works

### 4.3 Test Navigation & Re-recording
**Steps:**

1. Go back to `$RAILWAY_URL`
2. Select same story
3. Should start at sentence 3 (first unrecorded)
4. Click "Previous" button
5. Should go to sentence 2
6. Sentence should show "Recording saved successfully!"
7. Play button should work (existing recording)
8. Record button should say "Re-record"
9. Click "Re-record"
10. Record new audio
11. Submit

**Verification Checklist:**
- [ ] Previous/Next buttons work
- [ ] Previously recorded sentences show correct status
- [ ] Existing recordings play correctly
- [ ] Re-record button appears for recorded sentences
- [ ] Re-recording uploads new file
- [ ] Old file deleted from R2 (check bucket)
- [ ] Database updated with new recording_id

### 4.4 Test User Progress
**Steps:**

1. Go to `$RAILWAY_URL` (home page)
2. Email should be remembered (sessionStorage)
3. Should show user progress section:
   - Total Recordings: 3 (or 4 if re-recorded)
   - Stories Started: 1
   - Stories Completed: 0

4. Complete all 43 sentences of Story 1
5. Return to home page
6. Progress should show:
   - Stories Completed: 1
   - Story 1: 100% completion

**Verification Checklist:**
- [ ] User progress displays correctly
- [ ] Recording counts accurate
- [ ] Story completion percentage correct
- [ ] User-specific stats shown per story

---

## Phase 5: Stress Testing & Edge Cases

### 5.1 Multiple Users Test
**Steps:**

1. Open Railway app in incognito window
2. Enter different email: `user2@example.com`
3. Record a few sentences from Story 2
4. Check review page shows recordings from both users
5. Each user should only see their own progress on home page

**Verification:**
- [ ] Multiple users can record simultaneously
- [ ] User isolation works correctly
- [ ] Review page shows all users' recordings
- [ ] Home page shows user-specific progress

### 5.2 Large Recording Test
**Steps:**

1. Record a very long sentence (30+ seconds)
2. Verify it uploads successfully
3. Check file size in R2
4. Play back long recording

**Verification:**
- [ ] Long recordings upload (within 10MB limit)
- [ ] Duration calculated correctly
- [ ] Playback works for long files

### 5.3 Network Failure Scenarios
**Steps:**

1. Record audio
2. Turn off network mid-upload
3. Check error handling
4. Turn network back on
5. Retry upload

**Verification:**
- [ ] Proper error messages shown
- [ ] App doesn't crash
- [ ] Retry mechanism works

### 5.4 Database Query Performance
**Check Query Performance:**

```sql
-- Check query execution times
EXPLAIN ANALYZE 
SELECT * FROM recordings r
JOIN sentences s ON r.sentence_id = s.id
JOIN stories st ON s.story_id = st.id;

-- Should be fast (< 50ms)

-- Check index usage
SELECT schemaname, tablename, indexname 
FROM pg_indexes 
WHERE tablename IN ('recordings', 'sentences', 'stories');
```

**Verification:**
- [ ] Queries execute in < 100ms
- [ ] Indexes are used
- [ ] No full table scans

---

## Phase 6: Monitoring & Maintenance

### 6.1 Setup Monitoring
**Railway Dashboard:**
- Monitor deployment logs
- Track memory/CPU usage
- Set up alerts for errors

**Application Logging:**
Add structured logging:
```javascript
// backend/server.js
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
});
```

### 6.2 Error Tracking
**Add Error Logging:**
```javascript
// backend/middleware/errorHandler.js
function errorHandler(err, req, res, next) {
    console.error('Error:', {
        message: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString()
    });
    
    res.status(err.status || 500).json({
        error: process.env.NODE_ENV === 'production' 
            ? 'Internal server error' 
            : err.message
    });
}
```

### 6.3 Backup Strategy
**Database Backups:**
- Railway PostgreSQL has automatic daily backups
- Verify in Railway dashboard

**R2 Backups:**
- R2 has built-in redundancy
- Consider lifecycle rules for old files

---

## Phase 7: Custom Domain (Optional)

### 7.1 Setup Custom Domain on Railway
**Steps:**
1. Railway Dashboard → Settings → Domains
2. Add custom domain: `konkani-collector.yourdomain.com`
3. Add DNS records as shown

### 7.2 Setup Custom Domain for R2
**Steps:**
1. Cloudflare → R2 → Settings → Public Access
2. Add custom domain: `cdn.yourdomain.com`
3. Update `R2_PUBLIC_URL` environment variable

---

## Testing Checklist Summary

### Phase 1: Database
- [ ] Schema imported correctly
- [ ] Migrations applied
- [ ] Sample data loaded
- [ ] Connection from app works

### Phase 2: R2 Storage
- [ ] Bucket created
- [ ] API token works
- [ ] Upload from local works
- [ ] Playback from R2 works

### Phase 3: Railway Deployment
- [ ] App deploys successfully
- [ ] Health endpoint works
- [ ] APIs return correct data
- [ ] Static files load

### Phase 4: End-to-End
- [ ] Recording flow works
- [ ] Files upload to R2
- [ ] Database records created
- [ ] Review page works
- [ ] Navigation works
- [ ] Re-recording works

### Phase 5: Stress Testing
- [ ] Multiple users work
- [ ] Large files upload
- [ ] Error handling works
- [ ] Performance acceptable

### Phase 6: Production Ready
- [ ] Monitoring setup
- [ ] Logging enabled
- [ ] Backups configured
- [ ] Error tracking works

---

## Rollback Plans

### If Database Migration Fails:
1. Keep local PostgreSQL running
2. Use local `DATABASE_URL` in `.env`
3. Debug Railway DB schema issues
4. Re-run migrations

### If R2 Integration Fails:
1. Set `STORAGE_TYPE=local`
2. Continue using local file storage
3. Debug R2 credentials/permissions
4. Retry R2 setup

### If Railway Deployment Fails:
1. App continues running locally
2. Check Railway logs for errors
3. Fix issues in code
4. Redeploy

### If Production App Has Issues:
1. Roll back to previous Railway deployment
2. Check error logs
3. Fix issues locally
4. Test thoroughly
5. Redeploy

---

## Success Metrics

### Performance Targets:
- Page load time: < 2 seconds
- Recording upload: < 5 seconds
- Audio playback start: < 1 second
- API response time: < 500ms

### Functionality Targets:
- ✅ 100% of recording flow working
- ✅ 100% of navigation working
- ✅ 100% of review features working
- ✅ 0 critical errors in logs

### User Experience:
- Clear error messages
- Loading indicators
- Responsive UI
- No data loss

---

## Next Steps After Deployment

1. **Share with Community:**
   - Create announcement
   - Share Railway URL
   - Gather feedback

2. **Monitor Usage:**
   - Track number of users
   - Track recordings per day
   - Monitor storage usage

3. **Iterate:**
   - Fix bugs reported by users
   - Add requested features
   - Optimize performance

4. **Scale:**
   - Add more stories
   - Add more languages
   - Improve ASR model with collected data
