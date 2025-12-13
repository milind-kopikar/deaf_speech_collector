# Deaf Speech Collector

**Beyond the Echo**

Web application for collecting deaf speech recordings in Marathi to fine-tune ASR (Automatic Speech Recognition) models to understand deaf speech patterns.

## Mission

This project aligns with **[UN Sustainable Development Goal 3: Good Health and Well-Being](https://sdgs.un.org/goals/goal3)** by promoting inclusive technology and accessibility for the deaf community.

## Features

- 📖 **Story Management**: Import Marathi stories from .txt files, split into sentences
- 🎙️ **Web Recorder**: Accessible browser-based recording interface
- 🔌 **Programmatic API**: Full API access for external systems
- ✅ **Audio Validation**: Automatic format/quality checks on upload
- 📊 **Testing APIs**: Query and download recordings for verification
- 🔄 **ASR Export**: Generate manifest files compatible with `konkani_asr` training pipeline
- ☁️ **Flexible Storage**: Local storage (dev) or cloud (S3/B2/R2) for production

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                 konkani_collector                    │
├─────────────────────────────────────────────────────┤
│                                                       │
│  1. Story Import (scripts/import-story.js)          │
│     story.txt → Parse → PostgreSQL                   │
│                                                       │
│  2. Recording Collection                             │
│     A. Web UI (public/recorder.html)                │
│     B. Programmatic API (/api/recordings)           │
│                                                       │
│  3. Storage Layer (flexible)                         │
│     - Dev: Local uploads/                            │
│     - Prod: S3/B2/R2                                 │
│                                                       │
│  4. ASR Export (scripts/export-asr-manifest.js)     │
│     PostgreSQL + Storage → konkani_asr/data/        │
│                                                       │
└─────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL (Railway)
- ffmpeg (for audio conversion)

### Installation

```bash
cd konkani_collector
npm install
cp .env.example .env
# Edit .env with your DATABASE_URL and storage settings
```

### Database Setup

```bash
# Run schema creation
psql $DATABASE_URL < sql/schema.sql

# Optional: Load example data
psql $DATABASE_URL < sql/seed-example.sql
```

### Running Locally

```bash
# Start server
npm start

# Server runs on http://localhost:3000
# Open http://localhost:3000 in browser
```

### Import a Story

```bash
node scripts/import-story.js --file stories/story1.txt --title "पाव वाट"
```

### Export for ASR Training

```bash
node scripts/export-asr-manifest.js --output ../konkani_asr/data
```

## API Documentation

### Story Management

```http
GET /api/stories
# List all stories with recording progress
Response: [{ id, title, total_sentences, recorded_count, completion_pct }]

GET /api/stories/:id
# Get story details
Response: { id, title, language, sentences: [...] }
```

### Recording Collection (Web UI)

```http
GET /api/stories/:storyId/next?userId=<session_id>
# Get next unrecorded sentence for user
Response: {
  sentence_id, text_devanagari, text_iast,
  order, total_sentences, remaining
}

POST /api/recordings
# Upload recording (web form)
Form Data: { sentence_id, user_id, audio: File }
Response: { recording_id, status, validation }
```

### Programmatic API (for bots/apps)

```http
POST /api/programmatic/sentence
# Get specific or random sentence
Body: { story_id?: number, sentence_id?: number, random?: boolean }
Response: {
  sentence_id, text_devanagari, text_iast,
  story_title, order_in_story
}

POST /api/programmatic/upload
# Upload recording (JSON + base64 or multipart)
Body: {
  sentence_id: number,
  user_id: string,
  audio: File | base64_string,
  format?: string
}
Response: {
  recording_id, status, audio_duration,
  validation: { valid, errors, checks }
}
```

### Testing & Verification

```http
GET /api/test/health
# Database and system health check
Response: {
  database: "connected",
  storage: "ready",
  total_stories, total_sentences, total_recordings,
  recordings_by_status: { pending, approved, rejected }
}

GET /api/test/sample?status=approved
# Get random sentence-audio pair
Response: {
  sentence: { id, text_devanagari, text_iast, story_title },
  recording: { id, audio_url, duration, sample_rate, file_size }
}

GET /api/test/audio/:recordingId
# Download audio file (streaming)
Response: Binary WAV file

GET /api/test/validate/:recordingId
# Validate specific recording
Response: {
  recording_id, valid, checks: {...}, errors: [...]
}
```

## Storage Configuration

### Local Storage (Development)

```env
STORAGE_TYPE=local
UPLOAD_DIR=./uploads
```

### S3-Compatible Storage (Production)

```env
STORAGE_TYPE=s3

# AWS S3
S3_ENDPOINT=https://s3.amazonaws.com
S3_BUCKET=deaf-speech-recordings
S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret

# Or Backblaze B2
S3_ENDPOINT=https://s3.us-west-002.backblazeb2.com
S3_BUCKET=deaf-speech-recordings
S3_REGION=us-west-002
AWS_ACCESS_KEY_ID=<B2_keyId>
AWS_SECRET_ACCESS_KEY=<B2_applicationKey>

# Or Cloudflare R2
S3_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
S3_BUCKET=deaf-speech-recordings
S3_REGION=auto
AWS_ACCESS_KEY_ID=<R2_access_key>
AWS_SECRET_ACCESS_KEY=<R2_secret_key>
```

## Railway Deployment

1. Push code to GitHub
2. Create new Railway project from GitHub repo
3. Add PostgreSQL service
4. Set environment variables in Railway dashboard
5. Deploy automatically on git push

## Project Structure

```
konkani_collector/
├── backend/
│   ├── server.js           # Express app entry
│   ├── db.js               # PostgreSQL connection
│   ├── storage.js          # Storage abstraction (local/S3)
│   ├── routes/             # API endpoints
│   ├── middleware/         # Validation, error handling
│   └── utils/              # Audio conversion, validation
├── scripts/                # CLI tools
│   ├── import-story.js
│   ├── export-asr-manifest.js
│   └── verify-audio.js
├── public/                 # Frontend
│   ├── index.html
│   ├── recorder.html
│   └── app.js
├── sql/                    # Database schema
│   ├── schema.sql
│   └── seed-example.sql
├── tests/                  # Unit tests
└── uploads/                # Local file storage (gitignored)
```

## Transliteration CLI

Use `scripts/transliterate-sentences.js` to apply transliteration rules to sentences stored in the DB. This tool supports batch processing and checkpointing for long runs.

Flags:
- `--limit <n>`: Limit the number of rows to process (default 5). If `0`, entire table is processed in batches.
- `--all`: Alias for `--limit 0`.
- `--batch-size <n>`: Number of rows to fetch/update per batch (default 100).
- `--start-id <n>`: Start processing from `id > startId`.
- `--checkpoint-file <path>`: Optional; write the `lastId` processed to a JSON checkpoint file for resuming long runs.
- `--dry-run`: Do not perform database updates (report-only).

Examples:
```powershell
# Process 5 rows (default)
node scripts/transliterate-sentences.js --limit 5

# Process whole table in batches of 500 rows and save checkpoint
node scripts/transliterate-sentences.js --limit 0 --batch-size 500 --checkpoint-file trans-checkpoint.json

# Dry-run all rows; helpful to verify counts before writing
node scripts/transliterate-sentences.js --all --batch-size 200 --dry-run
```

## Processing Uploaded Recordings (ffmpeg conversion)

If you need to convert previously uploaded audio files to WAV (16kHz mono) and re-run validation, use the `process-recordings` script.

Prerequisites:
- Install ffmpeg and ffprobe and ensure they are available in the PATH.
  - On Windows (with Chocolatey): `choco install ffmpeg` or download binary from ffmpeg.org
  - On macOS (Homebrew): `brew install ffmpeg`
  - On Linux (apt): `sudo apt-get install ffmpeg` (or use your distro package manager)

Run the script in dry-run mode first, then actual processing:
```powershell
# Dry-run to preview what will be changed
node scripts/process-recordings.js --limit 100 --dry-run

# Process (make changes)
node scripts/process-recordings.js --limit 100
```

Notes:
- The script downloads the files from storage, converts non-WAV files to WAV (if ffmpeg is present), runs validation using ffprobe, then saves the new WAV file and updates the DB record with new metadata.
- Use `--batch-size` and `--start-id` to manage long runs and resuming.


## Development Workflow

1. **Import stories**: `node scripts/import-story.js --file story.txt`
2. **Start server**: `npm start`
3. **Record audio**: Open http://localhost:3000/recorder.html
4. **Verify data**: `curl http://localhost:3000/api/test/health`
5. **Export for ASR**: `node scripts/export-asr-manifest.js`
6. **Train model**: `cd ../konkani_asr && python scripts/fine_tune_hf.py`

## Testing

```bash
# Run all tests
npm test

# Test specific component
npm test -- import-story.test.js

# Integration tests
npm run test:integration
```

## License

MIT
