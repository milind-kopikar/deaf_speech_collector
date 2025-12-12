#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const { program } = require('commander');
const { query } = require('../backend/db');
const { applyRules, devanagariToDiacriticLatin } = require('../backend/utils/transliterate-canonical');

(async () => {
  program.option('-s, --story <id>', 'Story ID to dump sentences for', '1');
  program.option('-l, --limit <n>', 'Limit number of rows to dump', '5');
  program.option('-d, --direct', 'Use direct Devanagari -> Latin diacritical mapping', false);
  program.parse();
  const options = program.opts();
  try {
    // Query sentences limited by input
    const storyId = parseInt(options.story || '1', 10);
    const limit = parseInt(options.limit || '5', 10);
    const sql = `SELECT id, order_in_story, text_devanagari, text_iast FROM sentences WHERE story_id = $1 ORDER BY order_in_story LIMIT ${limit}`;
    const res = await query(sql, [storyId]);
    const rows = res.rows;
    const direct = options.direct === true || options.direct === 'true';
    const lines = rows.map(r => {
      const directLatin = direct ? devanagariToDiacriticLatin(r.text_devanagari) : '';
      const output = r.text_iast || (!direct ? applyRules(r.text_devanagari) : directLatin);
      return `${r.order_in_story} | ${r.text_devanagari} || ${output}`;
    });

    const outputPath = path.resolve(process.cwd(), 'tmp_test.txt');
    await fs.writeFile(outputPath, lines.join('\n'), { encoding: 'utf8' });
    console.log(`Wrote ${rows.length} sentences to ${outputPath}`);
    process.exit(0);
  } catch (error) {
    console.error('Failed to dump sentences:', error);
    process.exit(1);
  }
})();
