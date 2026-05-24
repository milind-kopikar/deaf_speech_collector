#!/usr/bin/env node
/**
 * Apply a SQL migration file against the Postgres database identified
 * by the DATABASE_URL environment variable.
 *
 * Usage:
 *   $env:DATABASE_URL = "<from Railway>"
 *   node scripts/apply-migration.js sql/migrations/003_amchi_demo_telemetry.sql
 *
 * Prints the resulting list of public-schema tables so you can verify
 * the migration created what you expected (and that existing tables
 * are untouched).
 *
 * Safe to re-run: the migration uses CREATE TABLE IF NOT EXISTS.
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function main() {
    const migrationPath = process.argv[2];
    if (!migrationPath) {
        console.error('Usage: node scripts/apply-migration.js <path-to-migration.sql>');
        process.exit(1);
    }
    if (!process.env.DATABASE_URL) {
        console.error('DATABASE_URL env var is required.');
        console.error('Copy it from Railway → Postgres service → Variables tab.');
        process.exit(1);
    }
    if (!fs.existsSync(migrationPath)) {
        console.error(`Migration file not found: ${migrationPath}`);
        process.exit(1);
    }

    const sql = fs.readFileSync(migrationPath, 'utf8');
    console.log(`Applying migration: ${path.basename(migrationPath)}`);
    console.log(`Bytes: ${sql.length}`);

    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        // Railway Postgres uses TLS but with a self-signed CA on the proxy
        // hop; rejectUnauthorized:false is the standard pattern for this.
        ssl: { rejectUnauthorized: false },
    });

    try {
        await client.connect();
        console.log('Connected to Postgres.');
        await client.query(sql);
        console.log('✓ Migration applied successfully.');
        console.log('');

        // Verify what tables exist in the public schema.
        const tables = await client.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_name
        `);
        console.log(`Tables in public schema (${tables.rows.length}):`);
        tables.rows.forEach(r => console.log(`  - ${r.table_name}`));
    } finally {
        await client.end();
    }
}

main().catch(err => {
    console.error('Migration failed:', err.message);
    if (err.detail) console.error('Detail:', err.detail);
    process.exit(1);
});
