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

    // Attempt to match sentences by capturing chunks that end with Devanagari danda (।), double danda (॥), or ascii punctuation (. ? !)
    const matches = text.match(/[^।॥.!?]+[।॥.!?]*/gu) || [];
    let raw = matches.map(s => s.trim());
    
    // Post-process to merge standalone punctuation/quote tokens into previous sentence
    const isStandalonePunc = (s) => {
        if (!s || s.trim().length === 0) return false;
        const hasLetter = /[\p{L}\u0900-\u097F]/u.test(s);
        if (hasLetter) return false;
        return true;
    };

    const sentences = [];
    for (let i = 0; i < raw.length; i++) {
        const segment = raw[i];
        if (!segment || segment.length === 0) continue;
        if (isStandalonePunc(segment)) {
            if (sentences.length > 0) {
                sentences[sentences.length - 1] = (sentences[sentences.length - 1] + ' ' + segment).trim();
            } else if (i + 1 < raw.length && raw[i + 1] && raw[i + 1].length > 0) {
                raw[i + 1] = (segment + ' ' + raw[i + 1]).trim();
            } else {
                sentences.push(segment);
            }
        } else {
            sentences.push(segment);
        }
    }

    // Final sanitize
    return sentences.map(s => s.replace(/^\s+|\s+$/g, '').replace(/^["'""''({[]+|["'""'')}\].,;:!?\-]+$/g, '').replace(/\s+/g, ' ')).filter(s => s && /[\p{L}\u0900-\u097F]/u.test(s));
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
                        const restOfContent = lines.slice(1).join('\n');
                        
                        // Use proper sentence splitting (handles Devanagari danda, punctuation, newlines)
                        const sentences = splitIntoSentences(restOfContent);
                        
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
