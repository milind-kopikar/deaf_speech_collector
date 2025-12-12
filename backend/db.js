/**
 * Database connection pool for PostgreSQL
 * Uses DATABASE_URL from environment
 */

const { Pool } = require('pg');

// Create connection pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Test connection on startup
pool.on('connect', () => {
    console.log('✓ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
    console.error('Unexpected database error:', err);
    process.exit(-1);
});

// Helper: Execute query with error handling
async function query(text, params) {
    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        console.log(`Query executed in ${duration}ms:`, text.substring(0, 100));
        return res;
    } catch (error) {
        console.error('Database query error:', error);
        throw error;
    }
}

// Helper: Get single row
async function queryOne(text, params) {
    const res = await query(text, params);
    return res.rows[0] || null;
}

// Helper: Get all rows
async function queryAll(text, params) {
    const res = await query(text, params);
    return res.rows;
}

// Export pool and helpers
module.exports = {
    pool,
    query,
    queryOne,
    queryAll,
};
