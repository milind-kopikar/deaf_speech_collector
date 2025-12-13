#!/usr/bin/env node
/**
 * Auto-setup script that runs on Railway deployment
 * This will check if the database is initialized and set it up if needed
 */

const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');

async function autoSetup() {
    console.log('🚀 Auto-setup: Checking database status...');
    
    if (!process.env.DATABASE_URL) {
        console.log('❌ DATABASE_URL not set, skipping auto-setup');
        return;
    }
    
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    
    try {
        // Check if tables exist
        const tablesResult = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
        
        const tables = tablesResult.rows.map(r => r.table_name);
        console.log('📋 Found tables:', tables.join(', ') || 'none');
        
        // If no tables or missing key tables, run setup
        if (!tables.includes('stories') || !tables.includes('sentences')) {
            console.log('🔧 Database needs initialization, running setup...');
            
            // Read and execute schema
            const schemaPath = path.join(__dirname, '../sql/schema.sql');
            const schema = await fs.readFile(schemaPath, 'utf8');
            
            await pool.query(schema);
            console.log('✅ Database schema created');
            
            // Check if stories exist
            const storiesResult = await pool.query('SELECT COUNT(*) as count FROM stories');
            const storyCount = parseInt(storiesResult.rows[0].count);
            
            if (storyCount === 0) {
                console.log('📚 No stories found, auto-setup complete');
                console.log('⚠️  Please import stories manually using Railway CLI:');
                console.log('   railway run node scripts/import-story.js marathi_story1.txt');
            }
        } else {
            console.log('✅ Database already initialized');
        }
        
        await pool.end();
        
    } catch (error) {
        console.error('❌ Auto-setup error:', error.message);
        await pool.end();
    }
}

// Only run if called directly (not imported)
if (require.main === module) {
    autoSetup().catch(console.error);
}

module.exports = autoSetup;
