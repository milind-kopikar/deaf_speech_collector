/**
 * Update story titles to match first sentence
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://deaf_user:Rahul1978!@localhost:5432/deaf_speech'
});

async function updateStoryTitles() {
    try {
        console.log('Updating story titles to match first sentence...\n');
        
        // Update titles
        // Use regexp_replace to strip trailing punctuation (danda, ascii punctuation) from first sentence when setting title
        await pool.query(`
            UPDATE stories s
            SET title = regexp_replace(se.text_devanagari, '[।॥.!?]+\\s*$', '')
            FROM sentences se
            WHERE se.story_id = s.id
            AND se.order_in_story = 1
        `);
        
        // Show updated titles
        const result = await pool.query('SELECT id, title FROM stories ORDER BY id');
        console.log('Updated story titles:');
        console.table(result.rows);
        
        await pool.end();
        console.log('\n✅ Story titles updated successfully!');
        
    } catch (error) {
        console.error('Error updating titles:', error);
        process.exit(1);
    }
}

updateStoryTitles();
