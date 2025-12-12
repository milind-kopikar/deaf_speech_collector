# Quick Setup Guide

## Prerequisites
- Node.js 18+ installed
- PostgreSQL database (Railway.app recommended)
- ffmpeg installed (for audio conversion)

## Installation

### 1. Install Dependencies
```bash
npm install
```

### 2. Install ffmpeg

**Windows (using Chocolatey):**
```powershell
choco install ffmpeg
```

**Windows (manual):**
1. Download from https://ffmpeg.org/download.html
2. Extract and add to PATH

**Mac:**
```bash
brew install ffmpeg
```

**Linux:**
```bash
sudo apt install ffmpeg
```

### 3. Set Up Database

Create a PostgreSQL database on Railway.app:
1. Go to https://railway.app
2. Create new project
3. Add PostgreSQL service
4. Copy the DATABASE_URL

Run the schema:
```bash
# Connect to your database and run:
psql $DATABASE_URL < sql/schema.sql

# Or use Railway CLI:
railway run psql < sql/schema.sql
```

### 4. Configure Environment

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Edit `.env` and set:
```
DATABASE_URL=postgresql://user:pass@host:5432/dbname
STORAGE_TYPE=local
UPLOAD_DIR=./uploads
```

### 5. Import Test Story

```bash
# Copy a story file from konkani_asr
cp ../konkani_asr/story1.txt .

# Import it
node scripts/import-story.js --file story1.txt --title "पाव वाट"
```

### 6. Start Server

```bash
npm start
```

Open http://localhost:3000 in your browser!

## Development

### Run in dev mode (with auto-restart):
```bash
npm run dev
```

### Run tests:
```bash
npm test
```

### Export to ASR format:
```bash
node scripts/export-asr-manifest.js --output ../konkani_asr/data
```

## Deployment to Railway

### Option 1: GitHub Integration (Recommended)
1. Push code to GitHub
2. Go to Railway.app dashboard
3. New Project → Deploy from GitHub
4. Select your repository
5. Add PostgreSQL service
6. Set environment variables
7. Deploy!

### Option 2: Railway CLI
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Link project
railway link

# Deploy
railway up
```

## Troubleshooting

### "Cannot find module" errors
```bash
npm install
```

### ffmpeg not found
Make sure ffmpeg is installed and in PATH:
```bash
ffmpeg -version
```

### Database connection fails
Check your DATABASE_URL in .env:
```bash
psql $DATABASE_URL -c "SELECT 1"
```

### Port already in use
Change PORT in .env:
```
PORT=3001
```

## Next Steps

1. **Import Stories**: Use `import-story.js` to load Konkani sentences
2. **Start Recording**: Open the web interface and record sentences
3. **Review Recordings**: Use test endpoints at `/api/test/`
4. **Export for ASR**: Use `export-asr-manifest.js` to generate training data
5. **Train Model**: Use exported manifests in `konkani_asr` project

## API Testing

Test the API with curl:

```bash
# Health check
curl http://localhost:3000/health

# List stories
curl http://localhost:3000/api/stories

# Get next sentence
curl "http://localhost:3000/api/sentences/1/next?userId=test"

# Upload recording (multipart)
curl -X POST http://localhost:3000/api/recordings \
  -F "audio=@recording.wav" \
  -F "sentenceId=1" \
  -F "userId=test"
```

## File Structure

```
konkani_collector/
├── backend/
│   ├── server.js          # Express app entry
│   ├── db.js              # Database helpers
│   ├── storage.js         # Storage abstraction
│   ├── middleware/        # Validation & error handling
│   ├── routes/            # API endpoints
│   └── utils/             # Audio processing
├── public/                # Frontend files
├── scripts/               # CLI tools
├── sql/                   # Database schema
└── uploads/               # Local audio storage (dev)
```

## Support

For issues or questions:
- Check README.md for detailed documentation
- Review API endpoints in README.md
- Test using `/api/test/*` endpoints
- Check logs in console output
