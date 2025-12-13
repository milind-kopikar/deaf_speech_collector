#!/usr/bin/env node
/**
 * Auto-setup script that runs on Railway deployment
 * This will check if the database is initialized and set it up if needed
 */

const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');

function splitIntoSentences(text) {
    // Normalize newlines into Devanagari danda so that line breaks are treated as sentence boundaries
    text = text.replace(/\r\n/g, '\n');
    // Replace single or multiple new lines with a Devanagari danda to force sentence break
    text = text.replace(/\n+/g, '। ');

    // Split sentences while preserving quoted text
    // Strategy: Split on sentence-ending punctuation (।॥.!?) ONLY when not inside quotes
    const sentences = [];
    let current = '';
    let inQuote = false;
    let quoteChar = null;
    
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const charCode = char.charCodeAt(0);
        
        // Track quote state (supports both ASCII and Unicode quotes)
        // ASCII: " (34) ' (39)
        // Unicode left: " (8220) ' (8216)
        // Unicode right: " (8221) ' (8217)
        const isQuote = char === '"' || char === "'" || 
                       charCode === 8220 || charCode === 8221 || 
                       charCode === 8216 || charCode === 8217;
        
        if (isQuote) {
            if (!inQuote) {
                inQuote = true;
                quoteChar = char;
            } else if (char === quoteChar || 
                      (quoteChar.charCodeAt(0) === 8220 && charCode === 8221) || // " to "
                      (quoteChar.charCodeAt(0) === 8216 && charCode === 8217) || // ' to '
                      (quoteChar === '"' && (charCode === 8220 || charCode === 8221)) ||
                      (quoteChar === "'" && (charCode === 8216 || charCode === 8217))) {
                inQuote = false;
                quoteChar = null;
            }
            current += char;
        }
        // If we're at sentence-ending punctuation and NOT inside quotes
        else if (['।', '॥', '.', '!', '?'].includes(char) && !inQuote) {
            current += char;
            // Check if next char is whitespace or end of string (real sentence boundary)
            if (i + 1 >= text.length || /\s/.test(text[i + 1])) {
                const trimmed = current.trim();
                if (trimmed && /[\p{L}\u0900-\u097F]/u.test(trimmed)) {
                    sentences.push(trimmed);
                }
                current = '';
            }
        }
        // Regular character
        else {
            current += char;
        }
    }
    
    // Don't forget the last sentence if it doesn't end with punctuation
    if (current.trim() && /[\p{L}\u0900-\u097F]/u.test(current.trim())) {
        sentences.push(current.trim());
    }

    // Normalize whitespace in each sentence
    return sentences.map(s => s.replace(/\s+/g, ' ').trim()).filter(s => s.length > 0);
}

async function autoSetup() {
    console.log('🚀 Auto-setup: Checking database status...');
    
    if (!process.env.DATABASE_URL) {
        console.log('❌ DATABASE_URL not set, skipping auto-setup');
        return;
    }
    
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    
    try {
        // Check if tables exist
        const tablesResult = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
        
        const tables = tablesResult.rows.map(r => r.table_name);
        console.log('📋 Found tables:', tables.join(', ') || 'none');
        
        // If no tables or missing key tables, run setup
        if (!tables.includes('stories') || !tables.includes('sentences')) {
            console.log('🔧 Database needs initialization, running setup...');
            
            // Read and execute schema
            const schemaPath = path.join(__dirname, '../sql/schema.sql');
            const schema = await fs.readFile(schemaPath, 'utf8');
            
            await pool.query(schema);
            console.log('✅ Database schema created');
        }
        
        // Check if stories exist (moved outside the table check)
        const storiesResult = await pool.query('SELECT COUNT(*) as count FROM stories');
        const storyCount = parseInt(storiesResult.rows[0].count);
        
        // Force re-import if FORCE_REIMPORT env var is set
        const forceReimport = process.env.FORCE_REIMPORT === 'true';
        
        if (forceReimport && storyCount > 0) {
            console.log('🔄 FORCE_REIMPORT enabled, clearing existing stories...');
            await pool.query('DELETE FROM recordings');
            await pool.query('DELETE FROM user_progress');
            await pool.query('DELETE FROM sentences');
            await pool.query('DELETE FROM stories');
            console.log('✅ Existing data cleared');
        }
        
        const currentStoryCount = forceReimport ? 0 : storyCount;
        
        if (currentStoryCount === 0) {
            console.log('📚 No stories found, importing Marathi stories...');
                
                // Import stories automatically
                const storyFiles = [
                    'marathi_story1.txt',
                    'marathi_story2.txt',
                    'marathi_story3.txt'
                ];
                
                for (const storyFile of storyFiles) {
                    try {
                        const storyPath = path.join(__dirname, '..', storyFile);
                        const storyContent = await fs.readFile(storyPath, 'utf8');
                        const lines = storyContent.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                        
                        if (lines.length === 0) {
                            console.log(`⚠️  ${storyFile} is empty, skipping`);
                            continue;
                        }
                        
                        const title = lines[0];
                        const allContent = lines.join('\n');
                        
                        // Use proper sentence splitting (handles Devanagari danda, punctuation, newlines)
                        const sentences = splitIntoSentences(allContent);
                        
                        console.log(`Importing ${storyFile}: "${title}" (${sentences.length} sentences)...`);
                        
                        // Insert story
                        const storyResult = await pool.query(
                            'INSERT INTO stories (title, language, total_sentences) VALUES ($1, $2, $3) RETURNING id',
                            [title, 'marathi', sentences.length]
                        );
                        const storyId = storyResult.rows[0].id;
                        
                        // Insert sentences
                        for (let i = 0; i < sentences.length; i++) {
                            await pool.query(
                                'INSERT INTO sentences (story_id, order_in_story, text_devanagari) VALUES ($1, $2, $3)',
                                [storyId, i + 1, sentences[i]]
                            );
                        }
                        
                        console.log(`✅ Imported ${storyFile}`);
                    } catch (err) {
                        console.error(`❌ Failed to import ${storyFile}:`, err.message);
                    }
                }
                
                console.log('✅ Story import complete');
            }
        
        await pool.end();
        
    } catch (error) {
        console.error('❌ Auto-setup error:', error.message);
        await pool.end();
    }
}

// Only run if called directly (not imported)
if (require.main === module) {
    autoSetup().catch(console.error);
}

module.exports = autoSetup;
