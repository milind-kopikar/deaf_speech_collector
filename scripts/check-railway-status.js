#!/usr/bin/env node
/**
 * Quick diagnostic script to check Railway deployment status
 * Run this in Railway shell or locally with DATABASE_URL set
 */

const { Pool } = require('pg');

async function checkStatus() {
    console.log('🔍 Checking Railway Deployment Status\n');
    console.log('=' .repeat(60));
    
    // Check DATABASE_URL
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        console.error('❌ DATABASE_URL not set');
        process.exit(1);
    }
    console.log('✅ DATABASE_URL is set');
    console.log('   ', dbUrl.replace(/:[^:@]+@/, ':****@'));
    
    const pool = new Pool({ 
        connectionString: dbUrl,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    
    try {
        // Test connection
        console.log('\n📡 Testing database connection...');
        await pool.query('SELECT NOW()');
        console.log('✅ Database connection successful');
        
        // Check tables
        console.log('\n📋 Checking tables...');
        const tablesResult = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name
        `);
        const tables = tablesResult.rows.map(r => r.table_name);
        
        if (tables.length === 0) {
            console.log('❌ No tables found');
            console.log('\n📝 Next step: Run database initialization:');
            console.log('   node scripts/setup-railway-db.js');
        } else {
            console.log('✅ Tables found:', tables.join(', '));
            
            const expectedTables = ['stories', 'sentences', 'recordings', 'user_progress'];
            const missing = expectedTables.filter(t => !tables.includes(t));
            
            if (missing.length > 0) {
                console.log('⚠️  Missing tables:', missing.join(', '));
                console.log('\n📝 Next step: Run database initialization:');
                console.log('   node scripts/setup-railway-db.js');
            }
        }
        
        // Check stories (if table exists)
        if (tables.includes('stories')) {
            console.log('\n📚 Checking stories...');
            const storiesResult = await pool.query('SELECT COUNT(*) as count FROM stories');
            const count = parseInt(storiesResult.rows[0].count);
            
            if (count === 0) {
                console.log('❌ No stories found');
                console.log('\n📝 Next step: Import Marathi stories:');
                console.log('   node scripts/import-story.js marathi_story1.txt');
                console.log('   node scripts/import-story.js marathi_story2.txt');
                console.log('   node scripts/import-story.js marathi_story3.txt');
            } else {
                console.log(`✅ Found ${count} stories`);
                
                const storiesDetail = await pool.query(`
                    SELECT id, title, total_sentences, language 
                    FROM stories 
                    ORDER BY id
                `);
                console.log('\nStories:');
                console.table(storiesDetail.rows);
            }
        }
        
        // Check sentences (if table exists)
        if (tables.includes('sentences')) {
            console.log('\n📝 Checking sentences...');
            const sentencesResult = await pool.query('SELECT COUNT(*) as count FROM sentences');
            const count = parseInt(sentencesResult.rows[0].count);
            console.log(`   Found ${count} sentences`);
        }
        
        // Check recordings (if table exists)
        if (tables.includes('recordings')) {
            console.log('\n🎤 Checking recordings...');
            const recordingsResult = await pool.query('SELECT COUNT(*) as count FROM recordings');
            const count = parseInt(recordingsResult.rows[0].count);
            console.log(`   Found ${count} recordings`);
        }
        
        // Check R2 config
        console.log('\n☁️  Checking R2 configuration...');
        const r2Vars = ['STORAGE_TYPE', 'S3_ENDPOINT', 'S3_BUCKET', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'];
        const missingR2 = [];
        
        r2Vars.forEach(v => {
            if (!process.env[v]) {
                missingR2.push(v);
            } else if (v === 'AWS_ACCESS_KEY_ID') {
                console.log(`   ${v}: ${process.env[v].substring(0, 8)}...`);
            } else if (v === 'AWS_SECRET_ACCESS_KEY') {
                console.log(`   ${v}: ${'*'.repeat(32)}`);
            } else {
                console.log(`   ${v}: ${process.env[v]}`);
            }
        });
        
        if (process.env.S3_PREFIX) {
            console.log(`   S3_PREFIX: ${process.env.S3_PREFIX}`);
        }
        
        if (missingR2.length > 0) {
            console.log('⚠️  Missing R2 variables:', missingR2.join(', '));
        } else {
            console.log('✅ All R2 variables are set');
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ Status check complete\n');
        
        await pool.end();
        
    } catch (error) {
        console.error('\n❌ Error during status check:', error.message);
        await pool.end();
        process.exit(1);
    }
}

checkStatus();
