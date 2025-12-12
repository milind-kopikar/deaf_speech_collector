# PowerShell script to automate Railway database setup and story import
# Prerequisites:
# - Railway PostgreSQL created with public networking enabled
# - DATABASE_URL copied from Railway dashboard
#
# Usage:
#   .\scripts\import-all-to-railway.ps1

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Railway Database + Stories Import" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if DATABASE_URL is set
if (-not $env:DATABASE_URL) {
    Write-Host "❌ DATABASE_URL not set!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please set it first:" -ForegroundColor Yellow
    Write-Host '  $env:DATABASE_URL="postgresql://postgres:xxx@xxx.proxy.rlwy.net:12345/railway"' -ForegroundColor Gray
    Write-Host ""
    Write-Host "Get the URL from:" -ForegroundColor Yellow
    Write-Host "  Railway Dashboard → PostgreSQL → Connect → DATABASE_URL (Public)" -ForegroundColor Gray
    Write-Host ""
    exit 1
}

Write-Host "✓ DATABASE_URL is set" -ForegroundColor Green
Write-Host ""

# Step 1: Setup database schema
Write-Host "Step 1: Setting up database schema..." -ForegroundColor Cyan
node .\scripts\setup-railway-db.js

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "❌ Database setup failed!" -ForegroundColor Red
    Write-Host "Fix the errors above and try again." -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Step 2: Importing stories..." -ForegroundColor Cyan
Write-Host ""

# Import story 1
Write-Host "Importing Story 1..." -ForegroundColor Yellow
node .\scripts\import-story.js --file .\story1.txt --title "चल र भपळ (Story 1)"

if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Story 1 import had issues" -ForegroundColor Yellow
}

# Import story 2
Write-Host ""
Write-Host "Importing Story 2..." -ForegroundColor Yellow
node .\scripts\import-story.js --file .\story2.txt --title "दक्ष प्रजापतिंगले यज्ञ"

if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Story 2 import had issues" -ForegroundColor Yellow
}

# Import story 3
Write-Host ""
Write-Host "Importing Story 3..." -ForegroundColor Yellow
node .\scripts\import-story.js --file .\story3.txt --title "बब्रुलिंगप्पागले समर्पण"

if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Story 3 import had issues" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Step 3: Verifying import..." -ForegroundColor Cyan
node .\scripts\list-stories.js

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Railway Database Import Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Disable Public Networking in Railway PostgreSQL settings" -ForegroundColor White
Write-Host "  2. Set up Cloudflare R2 (see RAILWAY_DEPLOYMENT_GUIDE.md)" -ForegroundColor White
Write-Host "  3. Deploy app to Railway" -ForegroundColor White
Write-Host ""
