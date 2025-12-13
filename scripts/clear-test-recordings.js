#!/usr/bin/env node
/**
 * Clear test recordings from the database
 * This will delete all recordings and reset user progress
 */

const { Pool } = require('pg');

async function clearRecordings() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    try {
        console.log('🗑️  Clearing test recordings...');
        
        // Delete all recordings
        const recordingsResult = await pool.query('DELETE FROM recordings');
        console.log(`✅ Deleted ${recordingsResult.rowCount} recordings`);
        
        // Reset user progress
        const progressResult = await pool.query('DELETE FROM user_progress');
        console.log(`✅ Deleted ${progressResult.rowCount} user progress entries`);
        
        // Reset recording stats
        const statsResult = await pool.query('DELETE FROM recording_stats');
        console.log(`✅ Deleted ${statsResult.rowCount} recording stats entries`);
        
        console.log('✅ Database cleanup complete!');
        
    } catch (error) {
        console.error('❌ Error clearing recordings:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

clearRecordings();
