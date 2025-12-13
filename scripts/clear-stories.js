#!/usr/bin/env node
/**
 * Clear all stories and sentences from the database
 * Use this before re-importing with corrected sentence splitting
 */

const { Pool } = require('pg');

async function clearStories() {
    console.log('🗑️  Clearing stories and sentences from database...');
    
    if (!process.env.DATABASE_URL) {
        console.error('❌ DATABASE_URL not set');
        process.exit(1);
    }
    
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    
    try {
        // Delete recordings first (foreign key constraint)
        const recordingsResult = await pool.query('DELETE FROM recordings');
        console.log(`✓ Deleted ${recordingsResult.rowCount} recordings`);
        
        // Delete user_progress
        const progressResult = await pool.query('DELETE FROM user_progress');
        console.log(`✓ Deleted ${progressResult.rowCount} user progress entries`);
        
        // Delete sentences
        const sentencesResult = await pool.query('DELETE FROM sentences');
        console.log(`✓ Deleted ${sentencesResult.rowCount} sentences`);
        
        // Delete stories
        const storiesResult = await pool.query('DELETE FROM stories');
        console.log(`✓ Deleted ${storiesResult.rowCount} stories`);
        
        console.log('\n✅ Database cleared successfully');
        console.log('📝 Next: Redeploy or restart the Railway service to trigger auto-import with correct sentence splitting');
        
        await pool.end();
    } catch (error) {
        console.error('❌ Error clearing database:', error.message);
        await pool.end();
        process.exit(1);
    }
}

clearStories();
