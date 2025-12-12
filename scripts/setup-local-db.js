#!/usr/bin/env node
/**
 * Setup script for local development
 * Creates database schema and imports Marathi stories
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function setupLocalDatabase() {
    console.log('🚀 Setting up Deaf Speech Collector local database...\n');
    
    // Read DATABASE_URL from .env
    const envPath = path.join(__dirname, '..', '.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const dbUrlMatch = envContent.match(/DATABASE_URL=(.+)/);
    
    if (!dbUrlMatch) {
        console.error('❌ DATABASE_URL not found in .env file');
        console.log('\nPlease update .env with your PostgreSQL connection string:');
        console.log('DATABASE_URL=postgresql://postgres:your_password@localhost:5432/deaf_speech_collector');
        process.exit(1);
    }
    
    const databaseUrl = dbUrlMatch[1].trim();
    console.log(`📊 Database: ${databaseUrl.replace(/:[^:]+@/, ':****@')}\n`);
    
    const pool = new Pool({ connectionString: databaseUrl });
    
    try {
        // Test connection
        await pool.query('SELECT NOW()');
        console.log('✅ Database connection successful!\n');
        
        // Load and execute schema
        console.log('📝 Creating database schema...');
        const schemaPath = path.join(__dirname, '..', 'sql', 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        await pool.query(schema);
        console.log('✅ Schema created successfully!\n');
        
        // Check if stories already exist
        const { rows } = await pool.query('SELECT COUNT(*) FROM stories');
        const storyCount = parseInt(rows[0].count);
        
        if (storyCount > 0) {
            console.log(`⚠️  Database already has ${storyCount} stories.`);
            console.log('Skipping story import. Run import-story.js manually if needed.\n');
        } else {
            console.log('📚 Database is empty. Ready to import Marathi stories.\n');
            console.log('Run these commands to import stories:');
            console.log('  node scripts/import-story.js marathi_story1.txt');
            console.log('  node scripts/import-story.js marathi_story2.txt');
            console.log('  node scripts/import-story.js marathi_story3.txt\n');
        }
        
        console.log('✅ Setup complete! You can now:');
        console.log('  1. Import stories (see commands above)');
        console.log('  2. Start the server: npm start');
        console.log('  3. Visit: http://localhost:3000\n');
        
    } catch (error) {
        console.error('❌ Error setting up database:', error.message);
        
        if (error.code === 'ECONNREFUSED') {
            console.log('\n💡 Tips:');
            console.log('  - Make sure PostgreSQL is running');
            console.log('  - Check your DATABASE_URL in .env file');
            console.log('  - Create the database first:');
            console.log('    createdb deaf_speech_collector');
        } else if (error.code === '3D000') {
            console.log('\n💡 Database does not exist. Create it first:');
            console.log('  createdb deaf_speech_collector');
            console.log('  # Or using psql:');
            console.log('  psql -U postgres -c "CREATE DATABASE deaf_speech_collector;"');
        }
        
        process.exit(1);
    } finally {
        await pool.end();
    }
}

setupLocalDatabase();
