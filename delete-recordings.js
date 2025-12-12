const { query } = require('./backend/db');
const fs = require('fs');
const path = require('path');

async function deleteAllRecordings() {
    try {
        // Delete from database
        const result = await query('DELETE FROM recordings');
        console.log(`✓ Deleted ${result.rowCount} recordings from database`);
        
        // Delete audio files
        const recordingsDir = path.join(__dirname, 'uploads', 'recordings');
        
        if (fs.existsSync(recordingsDir)) {
            const files = fs.readdirSync(recordingsDir);
            let deletedCount = 0;
            
            for (const file of files) {
                const filePath = path.join(recordingsDir, file);
                if (fs.statSync(filePath).isFile()) {
                    fs.unlinkSync(filePath);
                    deletedCount++;
                }
            }
            
            console.log(`✓ Deleted ${deletedCount} audio files`);
        } else {
            console.log('✓ No audio files directory found');
        }
        
        console.log('\n✓ All recordings deleted successfully! Ready for fresh testing.');
        process.exit(0);
    } catch (error) {
        console.error('Error deleting recordings:', error);
        process.exit(1);
    }
}

deleteAllRecordings();
