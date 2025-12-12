#!/usr/bin/env node
/**
 * Export recordings as audio/text manifest for ASR training
 * Usage:
 *   node scripts/export-recordings.js --limit=4 [--user=you@example.com]
 *
 * Output:
 *   ./exported/audio/<recording_id>.wav
 *   ./exported/manifest.jsonl (JSON Lines with fields: audio_filepath, sentence_text, sentence_text_iast, recording_id, sentence_id, user_id)
 */

const fs = require('fs').promises;
const path = require('path');
const { pipeline } = require('stream/promises');
const Storage = require('../backend/storage');
const { Pool } = require('pg');

// Simple argument parsing
const argv = {};
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg.startsWith('--')) {
    const [key, value] = arg.substring(2).split('=');
    argv[key] = value || true;
  }
}
const limit = parseInt(argv.limit || argv.l || 4, 10);
const user = argv.user || argv.u || null;

const outDir = path.resolve(__dirname, '../exported');
const audioDir = path.join(outDir, 'audio');

async function main() {
    console.log('Export recordings manifest');
    await fs.mkdir(audioDir, { recursive: true });

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    try {
        let recordingsQuery = `
            WITH latest AS (
                SELECT *, ROW_NUMBER() OVER (PARTITION BY sentence_id, user_id ORDER BY created_at DESC) as rn
                FROM recordings
            )
            SELECT l.id as recording_id, l.audio_filepath, l.duration_seconds, l.user_id, l.created_at,
                   s.id as sentence_id, s.text_devanagari as sentence_text, s.text_iast as sentence_text_iast,
                   st.id as story_id, st.title as story_title
            FROM latest l
            JOIN sentences s ON s.id = l.sentence_id
            JOIN stories st ON st.id = s.story_id
            WHERE l.rn = 1
        `;

        const params = [];
        if (user) {
            recordingsQuery += ' AND l.user_id = $1';
            params.push(user);
        }

        recordingsQuery += ' ORDER BY l.created_at DESC LIMIT ' + limit;

        console.log('Executing query (limit=' + limit + (user ? ', user=' + user : '') + ')');
        const res = await pool.query(recordingsQuery, params);

        if (res.rows.length === 0) {
            console.log('No recordings found');
            process.exit(0);
        }

        const manifestPath = path.join(outDir, 'manifest.jsonl');
        await fs.writeFile(manifestPath, '');

        const storage = Storage; // singleton

        for (const row of res.rows) {
            const rid = row.recording_id;
            const key = row.audio_filepath;
            const outFile = path.join(audioDir, `${rid}.wav`);

            console.log(`Downloading recording ${rid} -> ${outFile} (key=${key})`);

            // Use storage.get to get Buffer if possible, else stream
            try {
                if (storage.type === 's3') {
                    // For S3, use getStream and pipe to file
                    const stream = await storage.getStream(key);
                    const writeStream = (await import('fs')).createWriteStream(outFile);
                    await pipeline(stream, writeStream);
                } else {
                    // Local
                    const buf = await storage.get(key);
                    await fs.writeFile(outFile, buf);
                }
            } catch (e) {
                console.error('Failed to download', key, e.message);
                continue;
            }

            const manifestEntry = {
                audio_filepath: `audio/${rid}.wav`,
                sentence_id: row.sentence_id,
                recording_id: rid,
                user_id: row.user_id,
                sentence_text: row.sentence_text,
                sentence_text_iast: row.sentence_text_iast || null,
                duration_seconds: row.duration_seconds,
                story_id: row.story_id,
                story_title: row.story_title
            };

            await fs.appendFile(manifestPath, JSON.stringify(manifestEntry, null, 0) + '\n');
            console.log('Appended manifest entry for recording', rid);
        }

        console.log('\nExport complete.');
        console.log('Manifest:', manifestPath);
        console.log('Audio dir:', audioDir);

        await pool.end();
    } catch (err) {
        console.error('Error exporting recordings:', err);
        process.exit(1);
    }
}

main();
