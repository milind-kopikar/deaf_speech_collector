#!/usr/bin/env node
/**
 * Approve all recordings for testing
 */

require('dotenv').config();
const { query } = require('../backend/db');

async function approveRecordings() {
    try {
        console.log('Approving all recordings...');
        
        const result = await query(
            `UPDATE recordings 
             SET status = $1, validation_status = $2 
             WHERE status != $1 OR validation_status != $2`,
            ['approved', 'valid']
        );
        
        console.log('✓ All recordings approved and marked as valid');
        
        // Show updated counts
        const counts = await query(`
            SELECT 
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'approved') as approved,
                COUNT(*) FILTER (WHERE validation_status = 'valid') as valid
            FROM recordings
        `);
        
        console.log(`\nRecording status:`);
        console.log(`  Total: ${counts[0].total}`);
        console.log(`  Approved: ${counts[0].approved}`);
        console.log(`  Valid: ${counts[0].valid}`);
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Failed to approve recordings:', error);
        process.exit(1);
    }
}

approveRecordings();
