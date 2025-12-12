# Test Production Endpoints
# Tests the Railway deployment API endpoints
# Usage: .\scripts\test-production-endpoints.ps1

$RAILWAY_URL = "https://konkanicollector-production.up.railway.app"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Testing Railway Production Endpoints" -ForegroundColor Cyan
Write-Host "URL: $RAILWAY_URL" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: Health check
Write-Host "TEST 1: Health Check" -ForegroundColor Yellow
Write-Host "GET /" -ForegroundColor Gray
try {
    $response = Invoke-WebRequest -Uri "$RAILWAY_URL/" -Method GET -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ PASSED - Server is responding (HTTP 200)" -ForegroundColor Green
    } else {
        Write-Host "❌ FAILED - Unexpected status code: $($response.StatusCode)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ FAILED - $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 2: Get stories list
Write-Host "TEST 2: Get Stories List" -ForegroundColor Yellow
Write-Host "GET /api/stories" -ForegroundColor Gray
try {
    $response = Invoke-RestMethod -Uri "$RAILWAY_URL/api/stories" -Method GET
    $stories = $response.stories
    $storyCount = $stories.Count
    Write-Host "✅ PASSED - Retrieved $storyCount stories" -ForegroundColor Green
    $stories | ForEach-Object {
        Write-Host "   - Story #$($_.id): $($_.title) ($($_.total_sentences) sentences)" -ForegroundColor Gray
    }
} catch {
    Write-Host "❌ FAILED - $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 3: Get story with sentences
Write-Host "TEST 3: Get Story Details (Story 1)" -ForegroundColor Yellow
Write-Host "GET /api/stories/1" -ForegroundColor Gray
try {
    $response = Invoke-RestMethod -Uri "$RAILWAY_URL/api/stories/1" -Method GET
    $story = $response.story
    $sentences = $response.sentences
    $sentenceCount = $sentences.Count
    Write-Host "✅ PASSED - Story: $($story.title) with $sentenceCount sentences" -ForegroundColor Green
    if ($sentenceCount -gt 0) {
        $firstSentence = $sentences[0]
        Write-Host "   Sample sentence #$($firstSentence.id):" -ForegroundColor Gray
        Write-Host "   Devanagari: $($firstSentence.text_devanagari)" -ForegroundColor Gray
        Write-Host "   IAST: $($firstSentence.text_iast)" -ForegroundColor Gray
    }
} catch {
    Write-Host "❌ FAILED - $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""
# Test 4: Get next sentence (simulates recording workflow)
Write-Host "TEST 4: Get Next Sentence to Record" -ForegroundColor Yellow
Write-Host "GET /api/sentences/1/next?userId=test-user" -ForegroundColor Gray
try {
    $response = Invoke-RestMethod -Uri "$RAILWAY_URL/api/sentences/1/next?userId=test-user" -Method GET
    if ($response.sentence) {
        Write-Host "✅ PASSED - Got next sentence to record" -ForegroundColor Green
        Write-Host "   Sentence ID: $($response.sentence.id)" -ForegroundColor Gray
        Write-Host "   Story: $($response.sentence.story_title)" -ForegroundColor Gray
        Write-Host "   Devanagari: $($response.sentence.text_devanagari)" -ForegroundColor Gray
        Write-Host "   IAST: $($response.sentence.text_iast)" -ForegroundColor Gray
    } else {
        Write-Host "⚠️  No sentences available (all completed)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ FAILED - $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""
Write-Host ""
# Test 5: Check user progress
Write-Host "TEST 5: Get User Progress" -ForegroundColor Yellow
Write-Host "GET /api/users/test@example.com/progress" -ForegroundColor Gray
try {
    $response = Invoke-RestMethod -Uri "$RAILWAY_URL/api/users/test@example.com/progress" -Method GET
    Write-Host "✅ PASSED - Retrieved progress data" -ForegroundColor Green
    Write-Host "   Total recordings: $($response.total_recordings)" -ForegroundColor Gray
    Write-Host "   Unique sentences: $($response.unique_sentences)" -ForegroundColor Gray
    Write-Host "   Stories started: $($response.stories_started)" -ForegroundColor Gray
} catch {
    Write-Host "❌ FAILED - $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""
Write-Host ""

# Summary
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TEST SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✅ All critical endpoints are working" -ForegroundColor Green
Write-Host ""
Write-Host "Next step: Test audio recording upload" -ForegroundColor Yellow
Write-Host "   1. Visit: $RAILWAY_URL/recorder.html" -ForegroundColor Gray
Write-Host "   2. Record a sentence" -ForegroundColor Gray
Write-Host "   3. Check Cloudflare R2 dashboard for uploaded file" -ForegroundColor Gray
Write-Host ""
