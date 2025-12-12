#!/usr/bin/env node
/**
 * Download audio files via Railway API endpoint
 */

const fs = require('fs').promises;
const path = require('path');
const { Pool } = require('pg');
const https = require('https');
const http = require('http');

function downloadFile(url, outputPath) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        
        protocol.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download: ${response.statusCode}`));
                return;
            }
            
            const fileStream = require('fs').createWriteStream(outputPath);
            response.pipe(fileStream);
            
            fileStream.on('finish', () => {
                fileStream.close();
                resolve();
            });
            
            fileStream.on('error', reject);
        }).on('error', reject);
    });
}

async function main() {
    const baseUrl = 'https://konkani-collector-production.up.railway.app';
    const outDir = path.resolve(__dirname, '../exported');
    const audioDir = path.join(outDir, 'audio');
    
    await fs.mkdir(audioDir, { recursive: true });
    console.log(`Output directory: ${audioDir}\n`);

    // Connect to Railway database to get recording metadata
    const pool = new Pool({ 
        connectionString: process.env.DATABASE_URL 
    });

    try {
        // Get the recordings
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
            const audioUrl = `${baseUrl}/api/recordings/${row.id}/audio`;
            
            console.log(`Downloading recording ${row.id}...`);
            console.log(`  URL: ${audioUrl}`);
            console.log(`  Output: ${outputPath}`);
            
            try {
                await downloadFile(audioUrl, outputPath);
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
        
        console.log(`\n✓ Export complete!`);
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
