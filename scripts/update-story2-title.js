#!/usr/bin/env node
/**
 * Update Story 2 title to include Devanagari text
 */

require('dotenv').config();
const { query } = require('../backend/db');

async function updateStoryTitle() {
    try {
        console.log('Updating Story 2 title...');
        
        const result = await query(
            'UPDATE stories SET title = $1 WHERE id = 2',
            ['धोंडू धोबी आनि रायू (Story 2)']
        );
        
        console.log('✓ Story 2 title updated successfully');
        
        // Verify the update
        const { queryAll } = require('../backend/db');
        const stories = await queryAll('SELECT id, title FROM stories ORDER BY id');
        console.log('\nCurrent stories:');
        stories.forEach(s => {
            console.log(`  Story ${s.id}: ${s.title}`);
        });
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Failed to update story title:', error);
        process.exit(1);
    }
}

updateStoryTitle();
