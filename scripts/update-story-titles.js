/**
 * Update story titles to match first sentence
 */

const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://konkani_user:Rahul1978!@localhost:5432/konkani_collector'
});

async function updateStoryTitles() {
    try {
        console.log('Updating story titles to match first sentence...\n');
        
        // Update titles
        await pool.query(`
            UPDATE stories s 
            SET title = se.text_devanagari 
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
