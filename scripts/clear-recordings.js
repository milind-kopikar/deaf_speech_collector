#!/usr/bin/env node
require('dotenv').config();
const { program } = require('commander');
const { queryAll, query } = require('../backend/db');
const storage = require('../backend/storage');
const path = require('path');
const fs = require('fs').promises;

program.option('--dry-run', 'Do not delete anything, just list files');
program.parse();
const options = program.opts();
const dryRun = !!options.dryRun;

(async () => {
  console.log('Fetching all recordings...');
  const rows = await queryAll('SELECT id, audio_filepath FROM recordings');
  console.log(`Found ${rows.length} recordings`);
  for (const r of rows) {
    console.log('Removing', r.audio_filepath, 'id', r.id);
    if (!dryRun) {
      try {
        // If storage is local, remove file
        if (process.env.STORAGE_TYPE === 'local' || !process.env.STORAGE_TYPE) {
          const localPath = path.join(process.cwd(), process.env.UPLOAD_DIR || './uploads', r.audio_filepath);
          await fs.unlink(localPath).catch(() => {});
        } else {
          // S3: delete from bucket
          // TODO: implement s3 deletion if needed
        }
        await query('DELETE FROM recordings WHERE id = $1', [r.id]);
      } catch (e) {
        console.error('Failed to delete recording', r.id, e.message);
      }
    }
  }
  console.log('Done');
  process.exit(0);
})();
