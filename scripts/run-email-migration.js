#!/usr/bin/env node
/**
 * Apply email tracking migration
 * Adds automatic lowercase normalization for user_id fields
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { query } = require('../backend/db');

async function runMigration() {
    try {
        console.log('🔄 Applying email tracking migration...\n');
        
        const migrationPath = path.join(__dirname, '../sql/migrations/001_add_email_constraint.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');
        
        console.log('Running migration SQL...');
        await query(sql);
        
        console.log('✅ Migration completed successfully!\n');
        
        // Verify the migration
        console.log('Verifying migration...');
        const recordingsCheck = await query(`
            SELECT COUNT(*) as count 
            FROM recordings 
            WHERE user_id != LOWER(TRIM(user_id))
        `);
        
        const progressCheck = await query(`
            SELECT COUNT(*) as count 
            FROM user_progress 
            WHERE user_id != LOWER(TRIM(user_id))
        `);
        
        console.log(`- Recordings with non-lowercase user_id: ${recordingsCheck[0].count}`);
        console.log(`- User progress with non-lowercase user_id: ${progressCheck[0].count}`);
        
        if (recordingsCheck[0].count === '0' && progressCheck[0].count === '0') {
            console.log('\n✅ All user_id fields are properly normalized!');
        } else {
            console.log('\n⚠️  Some user_id fields are not normalized. This might indicate an issue.');
        }
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

runMigration();
