require('dotenv').config();
const { query } = require('./backend/db');

async function checkDurations() {
    try {
        const result = await query(`
            SELECT r.id, s.text_devanagari, r.duration_seconds, r.file_size_bytes 
            FROM recordings r 
            JOIN sentences s ON r.sentence_id = s.id 
            WHERE r.id IN (19, 21, 22, 25, 17, 18, 20)
            ORDER BY r.id
        `);
        
        console.log('Recording durations:');
        console.log('');
        result.rows.forEach(row => {
            console.log(`ID ${row.id}: ${row.duration_seconds}s (${row.file_size_bytes} bytes)`);
            console.log(`   Text: ${row.text_devanagari}`);
            console.log('');
        });
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit();
    }
}

checkDurations();
