#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const { queryAll } = require('../backend/db');

program
  .requiredOption('-i, --id <number>', 'Story ID to export')
  .option('-o, --out <path>', 'Output file', 'tmp_test.txt')
  .option('-a, --append', 'Append to output file (default true)', true)
  .parse();

const options = program.opts();

(async () => {
  try {
    const storyId = parseInt(options.id, 10);
    const rows = await queryAll('SELECT order_in_story, id, text_devanagari, text_iast FROM sentences WHERE story_id = $1 ORDER BY order_in_story', [storyId]);
    const outPath = path.join(process.cwd(), options.out || 'tmp_test.txt');

    const lines = rows.map(r => `${r.order_in_story}\t${r.id}\t${r.text_devanagari}` + (r.text_iast ? `\t${r.text_iast}` : ''));
    const header = `\n=== Story ${storyId} Export (${new Date().toISOString()}) - ${rows.length} sentences ===\n`;

    if (options.append) {
      fs.appendFileSync(outPath, header + lines.join('\n'));
    } else {
      fs.writeFileSync(outPath, header + lines.join('\n'));
    }

    console.log(`Wrote ${rows.length} sentences for story ${storyId} to ${outPath}`);
  } catch (e) {
    console.error('Error exporting story sentences', e);
    process.exit(1);
  }
})();
