# PowerShell script to preview and import story2 and story3 into the database
# Usage: Open PowerShell in project folder and run: .\scripts\import-stories.ps1
# Make sure you have a valid DATABASE_URL in environment or via a .env file

# Optional: run preview to get JSON preview without DB changes
node .\scripts\preview-story.js --file .\story2.txt --title "दक्ष प्रजापतिंगले यज्ञ"
node .\scripts\preview-story.js --file .\story3.txt --title "बब्रुलिंगप्पागले समर्पण"

# Import story2 and replace existing story (if present)
# Make sure DATABASE_URL is set in your environment or a .env file in this folder
node .\scripts\import-story.js --file .\story2.txt --title "दक्ष प्रजापतिंगले यज्ञ" --replace

# Import story3 (does not replace unless flag passed)
node .\scripts\import-story.js --file .\story3.txt --title "बब्रुलिंगप्पागले समर्पण"

Write-Host "Done. Use the export script to verify: `node scripts/export-story-sentences.js --id <story_id>`" -ForegroundColor Green
