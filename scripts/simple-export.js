#!/usr/bin/env node
/**
 * Simple export to show audio-sentence pairs from Railway database
 */

const { Pool } = require('pg');

async function main() {
    const pool = new Pool({ 
        connectionString: process.env.DATABASE_URL 
    });

    try {
        console.log('Fetching recordings from database...\n');
        
        const query = `
            SELECT 
                r.id,
                r.audio_filepath,
                r.user_id,
                s.id as sentence_id,
                s.text_devanagari,
                s.text_iast,
                s.order_in_story,
                st.id as story_id,
                st.title
            FROM recordings r
            JOIN sentences s ON r.sentence_id = s.id
            JOIN stories st ON s.story_id = st.id
            WHERE r.status = 'approved'
            ORDER BY st.id, s.order_in_story
            LIMIT 4
        `;

        const result = await pool.query(query);
        
        console.log(`Found ${result.rows.length} recordings:\n`);
        
        result.rows.forEach((row, idx) => {
            console.log(`${idx + 1}. Recording ID: ${row.id}`);
            console.log(`   Story: ${row.title} (Story ${row.story_id})`);
            console.log(`   Sentence ${row.order_in_story}: ${row.text_devanagari}`);
            console.log(`   IAST: ${row.text_iast}`);
            console.log(`   Audio file: ${row.audio_filepath}`);
            console.log(`   User: ${row.user_id}`);
            console.log('');
        });

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await pool.end();
    }
}

main();
