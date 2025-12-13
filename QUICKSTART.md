# Deaf Speech Collector - Quick Start Guide

**Supporting UN SDG Goal 3: Good Health and Well-Being** 🌍

## Overview

This system collects deaf speech recordings in Marathi to fine-tune ASR (Automatic Speech Recognition) models to understand deaf speech patterns.

## Prerequisites

- Node.js 18+ and npm
- PostgreSQL 14+
- ffmpeg (included in vendor/ for Windows)

## Local Development Setup

### 1. Install Dependencies

```powershell
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env`:

```powershell
Copy-Item .env.example .env
```

Edit `.env` with your local PostgreSQL credentials:

```env
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/deaf_speech_collector
STORAGE_TYPE=local
PORT=3000
```

### 3. Create Database

```powershell
# Create database
createdb deaf_speech_collector

# Or using psql:
psql -U postgres -c "CREATE DATABASE deaf_speech_collector;"
```

### 4. Initialize Database Schema

```powershell
psql -U postgres -d deaf_speech_collector -f sql/schema.sql
```

### 5. Import Sample Marathi Stories

```powershell
# Import all three Marathi stories
node scripts/import-story.js marathi_story1.txt
node scripts/import-story.js marathi_story2.txt
node scripts/import-story.js marathi_story3.txt

# Verify import
node scripts/list-stories.js
```

### 6. Start the Server

```powershell
npm start
```

Visit: `http://localhost:3000`

## Railway Deployment

### 1. Create New Railway Project

1. Go to [Railway.app](https://railway.app)
2. Create new project
3. Add PostgreSQL database
4. Add Node.js service

### 2. Configure Environment Variables

In Railway dashboard, add:

```
DATABASE_URL=(automatically set by Railway PostgreSQL)
STORAGE_TYPE=s3
S3_ENDPOINT=https://c90f9011c5a59d5bf40c808f40e3e34b.r2.cloudflarestorage.com
S3_BUCKET=deaf-speech-recordings
S3_REGION=auto
AWS_ACCESS_KEY_ID=(your R2 access key)
AWS_SECRET_ACCESS_KEY=(your R2 secret key)
S3_PREFIX=deaf_speech
NODE_ENV=production
```

### 3. Connect GitHub Repository

1. Push code to GitHub
2. Connect repository to Railway
3. Railway will auto-deploy on push to main

### 4. Initialize Production Database

```powershell
# Set environment variable
$env:DATABASE_URL="postgresql://postgres:password@host:port/railway"

# Run schema
node scripts/setup-railway-db.js

# Import stories
node scripts/import-story.js marathi_story1.txt
node scripts/import-story.js marathi_story2.txt
node scripts/import-story.js marathi_story3.txt
```

## Cloudflare R2 Storage Setup

### 1. Create R2 Bucket

1. Go to Cloudflare dashboard
2. Create new R2 bucket: `deaf-speech-recordings`
3. Generate API token with read/write permissions

### 2. Configure CORS (Optional)

If accessing recordings directly from browser:

```json
[
  {
    "AllowedOrigins": ["https://your-railway-app.up.railway.app"],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["*"]
  }
]
```

## Usage

### Recording Workflow

1. User enters email address
2. Selects a Marathi story
3. Records each sentence one by one
4. Audio is validated (16kHz mono WAV)
5. Uploaded to R2 storage
6. Metadata saved to PostgreSQL

### Review Interface

Access: `http://localhost:3000/review.html`

- View all recordings
- Listen to audio playback
- Approve/reject recordings

### Export for ASR Training

```powershell
# Export approved recordings
$env:DATABASE_URL="postgresql://..."
$env:STORAGE_TYPE="s3"
$env:S3_BUCKET="deaf-speech-recordings"
$env:AWS_ACCESS_KEY_ID="..."
$env:AWS_SECRET_ACCESS_KEY="..."

node scripts/export-recordings.js --limit=100
```

Output:
- `exported/audio/*.wav` - Audio files
- `exported/manifest.jsonl` - Training manifest

## Project Structure

```
deaf_speech_collector/
├── backend/
│   ├── routes/          # API endpoints
│   ├── utils/           # Audio validation, storage
│   ├── db.js            # PostgreSQL connection
│   └── server.js        # Express app
├── public/
│   ├── index.html       # Landing page (story selection)
│   ├── recorder.html    # Recording interface
│   ├── review.html      # Admin review interface
│   └── styles.css       # UN SDG Goal 3 theme
├── scripts/
│   ├── import-story.js  # Import Marathi stories
│   └── export-recordings.js  # Export for ASR training
├── sql/
│   └── schema.sql       # Database schema
└── marathi_story*.txt   # Sample Marathi stories

```

## Contributing Marathi Stories

Stories should be:
- Written in Marathi (Devanagari script)
- Simple, clear sentences
- Appropriate for all ages
- One sentence per line
- Title on first line

Example format:

```
शीर्षक येथे
पहिले वाक्य येथे.
दुसरे वाक्य येथे.
तिसरे वाक्य येथे.
```

## Support

This project aligns with UN Sustainable Development Goal 3: Good Health and Well-Being by promoting inclusive AI technology for the deaf community.

**Mission:** Training AI to understand and recognize deaf speech patterns, making technology more accessible for everyone.

