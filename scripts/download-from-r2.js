#!/usr/bin/env node
/**
 * Download audio files from R2 for the 4 recordings
 */

const fs = require('fs').promises;
const path = require('path');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { Pool } = require('pg');
const { pipeline } = require('stream/promises');

async function main() {
    // Setup S3 client for R2
    const s3Client = new S3Client({
        endpoint: 'https://c90f9011c5a59d5bf40c808f40e3e34b.r2.cloudflarestorage.com',
        region: 'auto',
        credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        },
    });

    const bucket = 'konkani-recordings';
    const outDir = path.resolve(__dirname, '../exported');
    const audioDir = path.join(outDir, 'audio');
    
    await fs.mkdir(audioDir, { recursive: true });
    console.log(`Output directory: ${audioDir}\n`);

    // Connect to Railway database
    const pool = new Pool({ 
        connectionString: process.env.DATABASE_URL 
    });

    try {
        // Get the 4 recordings
        const result = await pool.query(`
            SELECT 
                r.id,
                r.audio_filepath,
                s.text_devanagari,
                s.text_iast,
                s.order_in_story,
                st.title
            FROM recordings r
            JOIN sentences s ON r.sentence_id = s.id
            JOIN stories st ON s.story_id = st.id
            WHERE r.status = 'approved'
            ORDER BY st.id, s.order_in_story
            LIMIT 4
        `);

        console.log(`Found ${result.rows.length} recordings to download\n`);

        const manifest = [];

        for (const row of result.rows) {
            const outputPath = path.join(audioDir, `${row.id}.wav`);
            
            console.log(`Downloading recording ${row.id}...`);
            console.log(`  R2 key: ${row.audio_filepath}`);
            console.log(`  Output: ${outputPath}`);
            
            try {
                // Download from R2
                const command = new GetObjectCommand({
                    Bucket: bucket,
                    Key: row.audio_filepath
                });
                
                const response = await s3Client.send(command);
                
                // Save to file
                const writeStream = require('fs').createWriteStream(outputPath);
                await pipeline(response.Body, writeStream);
                
                console.log(`  ✓ Downloaded successfully\n`);
                
                // Add to manifest
                manifest.push({
                    audio_filepath: `audio/${row.id}.wav`,
                    text: row.text_devanagari,
                    text_iast: row.text_iast,
                    recording_id: row.id,
                    sentence_order: row.order_in_story,
                    story_title: row.title
                });
                
            } catch (err) {
                console.log(`  ✗ Failed: ${err.message}\n`);
            }
        }

        // Write manifest
        const manifestPath = path.join(outDir, 'manifest.jsonl');
        const manifestData = manifest.map(item => JSON.stringify(item)).join('\n');
        await fs.writeFile(manifestPath, manifestData);
        
        console.log(`\nExport complete!`);
        console.log(`  Downloaded: ${manifest.length} files`);
        console.log(`  Manifest: ${manifestPath}`);
        console.log(`  Audio directory: ${audioDir}`);
        
    } finally {
        await pool.end();
    }
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
