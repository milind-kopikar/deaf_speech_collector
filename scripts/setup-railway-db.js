#!/usr/bin/env node
/**
 * Quick Railway Database Setup Script
 * Imports schema and stories to Railway PostgreSQL
 * 
 * Prerequisites:
 * - Railway PostgreSQL service created
 * - Public networking enabled temporarily on Railway PostgreSQL
 * - DATABASE_URL env var set to Railway's public connection string
 * 
 * Usage:
 *   $env:DATABASE_URL='<railway-public-database-url>'
 *   node scripts/setup-railway-db.js
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function setupDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('='.repeat(60));
    console.log('🚂 Railway Database Setup');
    console.log('='.repeat(60));
    console.log(`Database: ${process.env.DATABASE_URL.split('@')[1]}`);
    console.log('');

    // Test connection
    console.log('1️⃣  Testing connection...');
    const result = await client.query('SELECT NOW()');
    console.log(`✓ Connected at ${result.rows[0].now}`);
    console.log('');

    // Check if tables exist
    console.log('2️⃣  Checking existing tables...');
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    `);
    
    const existingTables = tablesResult.rows.map(r => r.table_name);
    console.log(`Found ${existingTables.length} existing tables:`, existingTables.join(', ') || 'none');
    
    if (existingTables.length > 0) {
      console.log('⚠️  Database already has tables. Drop them? (y/N)');
      // For automation, we'll skip dropping. User should manually drop if needed.
      console.log('Skipping drop. If you need fresh setup, manually run:');
      console.log('  psql $DATABASE_URL -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"');
      console.log('');
    }

    // Import schema if tables don't exist
    if (existingTables.length === 0 || !existingTables.includes('stories')) {
      console.log('3️⃣  Importing schema...');
      const schemaPath = path.join(__dirname, '../sql/schema.sql');
      const schemaSql = await fs.readFile(schemaPath, 'utf-8');
      
      await client.query(schemaSql);
      console.log('✓ Schema imported successfully');
      console.log('');
    } else {
      console.log('3️⃣  Schema already exists, skipping import');
      console.log('');
    }

    // Check for existing stories
    console.log('4️⃣  Checking for existing stories...');
    const storiesResult = await client.query('SELECT COUNT(*) as count FROM stories');
    const storyCount = parseInt(storiesResult.rows[0].count);
    console.log(`Found ${storyCount} stories in database`);
    console.log('');

    if (storyCount === 0) {
      console.log('✓ Database is ready for story import!');
      console.log('');
      console.log('Next steps:');
      console.log('  1. Import stories using import-story.js:');
      console.log('     node scripts/import-story.js --file story1.txt --title "चल र भपळ (Story 1)"');
      console.log('     node scripts/import-story.js --file story2.txt --title "दक्ष प्रजापतिंगले यज्ञ"');
      console.log('     node scripts/import-story.js --file story3.txt --title "बब्रुलिंगप्पागले समर्पण"');
      console.log('');
      console.log('  2. Verify with:');
      console.log('     node scripts/list-stories.js');
    } else {
      console.log('✓ Stories already imported!');
      console.log('');
      console.log('Story summary:');
      const stories = await client.query('SELECT id, title, total_sentences FROM stories ORDER BY id');
      stories.rows.forEach(s => {
        console.log(`  ${s.id}. ${s.title} (${s.total_sentences} sentences)`);
      });
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('✅ Railway Database Setup Complete!');
    console.log('='.repeat(60));
    console.log('');
    console.log('Security reminder:');
    console.log('  - Disable "Public Networking" in Railway PostgreSQL settings');
    console.log('  - The app will use private networking when deployed');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Setup failed:', error.message);
    console.error('');
    console.error('Troubleshooting:');
    console.error('  - Verify DATABASE_URL is set correctly');
    console.error('  - Check Railway PostgreSQL has "Public Networking" enabled');
    console.error('  - Ensure you have CREATE permissions on the database');
    console.error('');
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Verify DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set!');
  console.error('');
  console.error('Set it with:');
  console.error('  PowerShell: $env:DATABASE_URL="postgresql://..."');
  console.error('  Bash: export DATABASE_URL="postgresql://..."');
  console.error('');
  process.exit(1);
}

setupDatabase();
