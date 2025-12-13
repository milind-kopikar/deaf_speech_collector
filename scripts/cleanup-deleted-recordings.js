#!/usr/bin/env node
/**
 * Cleanup script to permanently delete recordings marked as 'deleted'
 * This will:
 * 1. Find all recordings with status='deleted' in the database
 * 2. Delete the corresponding audio files from R2 storage
 * 3. Remove the database entries
 * 
 * Run this periodically to clean up storage and database
 */

const { Pool } = require('pg');
const { getStorage } = require('../backend/storage');

async function cleanupDeletedRecordings() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    try {
        console.log('🗑️  Starting cleanup of deleted recordings...\n');
        
        // Get all recordings marked as 'deleted'
        const result = await pool.query(
            `SELECT id, filename, sentence_id, user_id 
             FROM recordings 
             WHERE status = $1 
             ORDER BY created_at`,
            ['deleted']
        );
        
        const deletedRecordings = result.rows;
        
        if (deletedRecordings.length === 0) {
            console.log('✅ No recordings marked for deletion found.');
            return;
        }
        
        console.log(`📊 Found ${deletedRecordings.length} recording(s) marked for deletion:\n`);
        
        const storage = getStorage();
        let successCount = 0;
        let failCount = 0;
        
        for (const recording of deletedRecordings) {
            try {
                console.log(`   Processing ID ${recording.id}: ${recording.filename}`);
                
                // Delete from R2 storage
                try {
                    await storage.deleteFile(recording.filename);
                    console.log(`      ✓ Deleted from R2: ${recording.filename}`);
                } catch (storageErr) {
                    console.warn(`      ⚠️  Storage delete failed (may not exist): ${storageErr.message}`);
                    // Continue even if storage delete fails (file may already be gone)
                }
                
                // Delete from database
                await pool.query('DELETE FROM recordings WHERE id = $1', [recording.id]);
                console.log(`      ✓ Deleted from database: ID ${recording.id}`);
                
                successCount++;
                console.log('');
                
            } catch (err) {
                console.error(`      ❌ Failed to delete recording ${recording.id}:`, err.message);
                failCount++;
                console.log('');
            }
        }
        
        console.log('━'.repeat(50));
        console.log(`\n📈 Cleanup Summary:`);
        console.log(`   ✅ Successfully deleted: ${successCount}`);
        if (failCount > 0) {
            console.log(`   ❌ Failed: ${failCount}`);
        }
        console.log(`\n✨ Cleanup complete!\n`);
        
    } catch (error) {
        console.error('❌ Cleanup error:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Run the cleanup
cleanupDeletedRecordings();
