#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const { program } = require('commander');
const { query, queryAll } = require('../backend/db');
const { devanagariToIAST } = require('../backend/utils/transliterate-canonical');

async function processBatch(options) {
  const batchSize = parseInt(options.batchSize || '100', 10);
  const dryRun = !!options.dryRun;
  const checkpointFile = options.checkpointFile || null;
  let lastId = parseInt(options.startId || '0', 10);
  let limit = parseInt(options.limit || '5', 10);
  const all = options.all || limit === 0;

  console.log('Starting transliteration with options:', { all, limit, batchSize, lastId, dryRun, checkpointFile });

  let totalProcessed = 0;
  let running = true;
  while (running) {
    // Determine how many to request in this batch
    const thisBatchSize = all ? batchSize : Math.min(batchSize, limit - totalProcessed);
    if (thisBatchSize <= 0) break;

    const rows = await queryAll('SELECT id, text_devanagari, text_iast FROM sentences WHERE id > $1 ORDER BY id LIMIT $2', [lastId, thisBatchSize]);
    if (!rows || rows.length === 0) break;

    let count = 0;
    for (const r of rows) {
      const iast = devanagariToIAST(r.text_devanagari);
      if (r.text_iast === iast) {
        // do nothing
      } else if (!dryRun) {
        await query('UPDATE sentences SET text_iast = $1 WHERE id = $2', [iast, r.id]);
        count++;
      } else {
        count++;
      }
      lastId = r.id; // advance lastId based on id ordering
      totalProcessed++;
    }

    if (checkpointFile) {
      try { fs.writeFileSync(checkpointFile, JSON.stringify({ lastId })); } catch (e) { console.warn('Could not write checkpoint file:', e); }
    }

    process.stdout.write(`\rUpdated this batch: ${count}; Total processed: ${totalProcessed}`);

    // If we were given an explicit limit, stop when we've reached it
    if (!all && totalProcessed >= limit) break;
    // If the number obtained is less than batch size on an 'all' run, we've reached the end
    if (all && rows.length < thisBatchSize) break;
  }
  console.log('\nDone.');
}

(async () => {
  program
    .option('-l, --limit <n>', 'Limit number of rows to process (0 = all)', '5')
    .option('-b, --batch-size <n>', 'Batch size for processing rows', '100')
    .option('--all', 'Process all rows (alias for --limit 0)')
    .option('--start-id <n>', 'Start processing from id > startId (default 0)', '0')
    .option('--checkpoint-file <path>', 'Write progress checkpoint to this file')
    .option('--dry-run', 'Do not apply DB updates; just report', false);
  program.parse();
  const options = program.opts();
  try {
    // If checkpoint file is provided and exists, load
    if (options.checkpointFile && fs.existsSync(options.checkpointFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(options.checkpointFile, 'utf8'));
        if (data && data.lastId) options.startId = String(data.lastId);
      } catch (e) { console.warn('Could not read checkpoint file, starting fresh.'); }
    }
    await processBatch(options);
    process.exit(0);
  } catch (err) {
    console.error('Error while transliterating:', err);
    process.exit(1);
  }
})();
