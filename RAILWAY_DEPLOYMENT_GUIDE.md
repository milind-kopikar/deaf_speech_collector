# Railway + Cloudflare R2 Deployment Guide

This guide walks through deploying the Konkani Collector app to Railway with PostgreSQL database and Cloudflare R2 audio storage.

---

## Prerequisites

- [ ] Railway account (https://railway.app)
- [ ] Cloudflare account with R2 enabled (https://dash.cloudflare.com)
- [ ] Git repository pushed to GitHub
- [ ] Local app tested and working

---

## Step 1: Provision Railway PostgreSQL Database

### 1.1 Create Railway Project
1. Go to https://railway.app/new
2. Click "New Project"
3. Name it: `konkani-collector`
4. Click "Add PostgreSQL"

### 1.2 Get Database Connection String
1. Click on the PostgreSQL service
2. Go to "Connect" tab
3. Copy the `DATABASE_URL` (looks like: `postgresql://postgres:xxx@xxx.railway.internal:5432/railway`)
4. Also note individual credentials:
   - `PGHOST`
   - `PGPORT` 
   - `PGDATABASE`
   - `PGUSER`
   - `PGPASSWORD`

### 1.3 Connect from Local Machine (Test)
Railway PostgreSQL is private by default. To connect from local:

1. In Railway dashboard → PostgreSQL service → Settings
2. Enable "Public Networking" temporarily
3. Copy the public `DATABASE_URL` (will have `.proxy.rlwy.net`)
4. Test connection:
```powershell
# Set temporary env var
$env:DATABASE_URL='<public_database_url_from_railway>'

# Test with node (if you have pg installed)
node -e "const {Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query('SELECT NOW()').then(r=>console.log('✓ Connected:',r.rows[0])).catch(e=>console.error('✗',e)).finally(()=>p.end())"
```

### 1.4 Import Database Schema
Run this from your `konkani_collector` folder:

```powershell
# Set Railway DATABASE_URL
$env:DATABASE_URL='<public_database_url_from_railway>'

# Import schema
Get-Content .\sql\schema.sql | psql $env:DATABASE_URL

# Verify tables created
psql $env:DATABASE_URL -c "\dt"
```

Expected output: `stories`, `sentences`, `recordings`, `user_progress` tables

### 1.5 Import Story Data
```powershell
# Import story 1
node .\scripts\import-story.js --file .\story1.txt --title "चल र भपळ (Story 1)"

# Import story 2 (new)
node .\scripts\import-story.js --file .\story2.txt --title "दक्ष प्रजापतिंगले यज्ञ"

# Import story 3
node .\scripts\import-story.js --file .\story3.txt --title "बब्रुलिंगप्पागले समर्पण"

# List stories to verify
node .\scripts\list-stories.js
```

Expected: 3 stories with 41-43 sentences each

### 1.6 Disable Public Access (Security)
Once data is imported:
1. Railway dashboard → PostgreSQL service → Settings
2. Disable "Public Networking"
3. The app will use private networking when deployed

✅ **Checkpoint:** Railway PostgreSQL is set up with schema and data

---

## Step 2: Set Up Cloudflare R2 Storage

### 2.1 Create R2 Bucket
1. Go to https://dash.cloudflare.com
2. Navigate to R2 Object Storage
3. Click "Create bucket"
4. Name: `konkani-recordings`
5. Location: Automatic
6. Click "Create bucket"

### 2.2 Create API Token
1. In R2 dashboard, click "Manage R2 API Tokens"
2. Click "Create API token"
3. Token name: `konkani-collector-app`
4. Permissions: Object Read & Write
5. Specify bucket: Select `konkani-recordings` only
6. Click "Create API Token"
7. **IMPORTANT:** Copy and save:
   - Access Key ID
   - Secret Access Key
   - Endpoint for S3 clients (e.g., `https://<account-id>.r2.cloudflarestorage.com`)

### 2.3 Test R2 Upload (Optional - Local Test)
Update your local `.env`:
```env
STORAGE_TYPE=s3
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_BUCKET=konkani-recordings
S3_REGION=auto
AWS_ACCESS_KEY_ID=<your-r2-access-key>
AWS_SECRET_ACCESS_KEY=<your-r2-secret-key>
```

Restart server and record a test sentence - it should upload to R2!

Check R2 dashboard to verify file appears in bucket.

✅ **Checkpoint:** R2 bucket created and tested

---

## Step 3: Deploy App to Railway

### 3.1 Connect GitHub Repository
1. Railway dashboard → Your project (`konkani-collector`)
2. Click "New" → "GitHub Repo"
3. Select your repository: `milind-kopikar/konkani_collector` (or `amchi_asr`)
4. Railway will auto-detect Node.js and create a service

### 3.2 Configure Environment Variables
In Railway dashboard → Your app service → Variables tab, add:

```env
# Node
NODE_ENV=production
PORT=3000

# Database (use Railway's internal reference)
DATABASE_URL=${{Postgres.DATABASE_URL}}

# Storage - Cloudflare R2
STORAGE_TYPE=s3
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_BUCKET=konkani-recordings
S3_REGION=auto
AWS_ACCESS_KEY_ID=<your-r2-access-key>
AWS_SECRET_ACCESS_KEY=<your-r2-secret-key>

# Audio validation
REQUIRED_SAMPLE_RATE=16000
REQUIRED_CHANNELS=1
REQUIRED_FORMAT=wav
MAX_FILE_SIZE_MB=10

# Features
ENABLE_TEST_ENDPOINTS=false
ENABLE_CORS=true
```

**Note:** `${{Postgres.DATABASE_URL}}` is a Railway service reference that auto-connects to your PostgreSQL service.

### 3.3 Deploy
1. Railway auto-deploys on every push to `main` branch
2. To trigger manual deploy: Railway dashboard → Service → Deployments → "Deploy Now"
3. Monitor logs: Railway dashboard → Service → Deployments → Click deployment → View logs

### 3.4 Get Public URL
1. Railway dashboard → Your app service → Settings
2. Under "Networking" → "Generate Domain"
3. Copy the URL (e.g., `https://konkani-collector-production.up.railway.app`)

✅ **Checkpoint:** App is deployed and accessible

---

## Step 4: Verify Deployment

### 4.1 Health Check
```powershell
$RAILWAY_URL='https://your-app.up.railway.app'
curl "$RAILWAY_URL/health"
```
Expected: `{"status":"ok",...}`

### 4.2 Test API Endpoints
```powershell
# Get stories
curl "$RAILWAY_URL/api/stories"

# Get next sentence
curl "$RAILWAY_URL/api/sentences/1/next?userId=test@example.com"
```

### 4.3 Test Recording Flow (Browser)
1. Open `$RAILWAY_URL` in browser
2. Enter email address
3. Select a story
4. Record a sentence
5. Submit recording
6. Check:
   - Recording uploads without error
   - Cloudflare R2 dashboard shows new file
   - Recording appears in review page

### 4.4 Test Playback
1. Go to `$RAILWAY_URL/review.html`
2. Play a recording
3. Audio should stream from R2

✅ **Checkpoint:** All features working in production!

---

## Step 5: Post-Deployment Tasks

### 5.1 Update Frontend URLs (if needed)
If you have a separate frontend or need CORS:
- Add your frontend domain to CORS allowlist in `backend/server.js`

### 5.2 Monitor Logs
Railway dashboard → Service → Deployments → View logs

### 5.3 Set Up Alerts (Optional)
Railway dashboard → Service → Settings → Add notification webhooks

### 5.4 Backups
Railway PostgreSQL has automatic daily backups.
To export manually:
```powershell
$env:DATABASE_URL='<railway_public_url>'
pg_dump $env:DATABASE_URL > backup_$(Get-Date -Format 'yyyyMMdd').sql
```

---

## Troubleshooting

### Database Connection Fails
- Check Railway PostgreSQL service is running
- Verify `DATABASE_URL` variable in app service
- Check app logs for specific error

### R2 Upload Fails
- Verify R2 API token has write permissions
- Check `S3_ENDPOINT` format (must be `https://`)
- Verify bucket name matches exactly
- Check app logs for AWS SDK errors

### Audio Doesn't Play
- Check browser console for CORS errors
- Verify R2 bucket has public read access (or configure signed URLs)
- Test audio URL directly in browser

### App Crashes on Startup
- Check Railway logs for error
- Common issues:
  - Missing environment variable
  - Database schema not imported
  - Port binding (Railway sets `PORT` automatically)

---

## Cost Estimate

- **Railway Hobby Plan:** $5/month
  - Includes PostgreSQL (1GB storage, 100GB bandwidth)
  - App hosting (512MB RAM, shared CPU)
  
- **Cloudflare R2:**
  - Storage: $0.015/GB/month (10GB free)
  - Class A operations: $4.50/million (free under 1M/month)
  - Class B operations: $0.36/million (free under 10M/month)
  - Egress: **FREE** (unlimited)

**Estimated total for ~1000 users, 10,000 recordings:**
- Railway: $5/month
- R2 Storage (10GB audio): ~$0.15/month
- R2 Operations: Free tier
- **Total: ~$5-6/month**

---

## Rollback Plan

If deployment fails:
1. Railway keeps previous deployment active
2. In Railway dashboard → Rollback to previous deployment
3. Or redeploy from a previous git commit

For database issues:
1. Railway has automatic daily backups
2. Restore from backup in Railway dashboard → PostgreSQL → Backups

---

## Next Steps

- [ ] Set up custom domain (Railway supports custom domains)
- [ ] Add monitoring/analytics
- [ ] Set up automated backups
- [ ] Configure CDN for static assets
- [ ] Add email notifications for users

**Your app is now live at:** `https://your-app.up.railway.app` 🎉
