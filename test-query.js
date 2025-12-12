require('dotenv').config();
const { query } = require('./backend/db');

async function testQuery() {
    try {
        // Check columns
        const cols = await query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'recordings' ORDER BY ordinal_position`);
        console.log('Recordings table columns:');
        console.table(cols.rows);
        
        // Test the actual query from the API
        console.log('\nTesting API query...');
        const result = await query(
            `SELECT 
                r.id,
                r.audio_filepath,
                r.duration_seconds as duration,
                r.needs_rerecording,
                r.created_at,
                r.user_id,
                s.id as sentence_id,
                s.text_devanagari as sentence_text,
                st.title as story_title
             FROM recordings r
             JOIN sentences s ON r.sentence_id = s.id
             JOIN stories st ON s.story_id = st.id
             ORDER BY r.created_at DESC
             LIMIT 3`
        );
        
        console.log('Query result:');
        console.table(result.rows);
        
    } catch (error) {
        console.error('Error:', error.message);
        console.error('Full error:', error);
    } finally {
        process.exit();
    }
}

testQuery();
