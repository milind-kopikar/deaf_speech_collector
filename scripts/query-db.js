#!/usr/bin/env node
/**
 * Quick SQL Query Runner
 * Run any SQL query against Railway database
 * 
 * Usage:
 *   node scripts/query-db.js "SELECT * FROM stories"
 *   node scripts/query-db.js "SELECT COUNT(*) FROM sentences WHERE story_id = 1"
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function runQuery() {
  const query = process.argv[2];
  
  if (!query) {
    console.log('Usage: node scripts/query-db.js "YOUR SQL QUERY"');
    console.log('');
    console.log('Examples:');
    console.log('  node scripts/query-db.js "SELECT * FROM stories"');
    console.log('  node scripts/query-db.js "SELECT COUNT(*) FROM sentences"');
    console.log('  node scripts/query-db.js "SELECT * FROM sentences WHERE story_id = 1 LIMIT 5"');
    process.exit(1);
  }

  try {
    console.log('Query:', query);
    console.log('');
    
    const result = await pool.query(query);
    
    if (result.rows.length === 0) {
      console.log('No rows returned.');
    } else {
      console.table(result.rows);
      console.log('');
      console.log(`Rows: ${result.rowCount}`);
    }
    
  } catch (error) {
    console.error('Error executing query:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runQuery();
