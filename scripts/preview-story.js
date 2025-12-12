#!/usr/bin/env node
/**
 * Preview story splitting and transliteration
 * Usage:
 *   node scripts/preview-story.js --file story2.txt --title "Title"
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const { program } = require('commander');
const { devanagariToIAST } = require('../backend/utils/transliterate-canonical');

program
  .requiredOption('-f, --file <path>', 'Path to story .txt file')
  .option('-t, --title <title>', 'Story title')
  .parse();

const options = program.opts();

function splitIntoSentences(text) {
  let raw = text.split(/[।॥\n]+/).map(s => s.trim());
  const isStandalonePunc = (s) => {
    if (!s || s.trim().length === 0) return false;
    const hasLetter = /[\p{L}\u0900-\u097F]/u.test(s);
    if (hasLetter) return false;
    return true;
  };
  const sentences = [];
  for (let i = 0; i < raw.length; i++) {
    const segment = raw[i];
    if (!segment || segment.length === 0) continue;
    if (isStandalonePunc(segment)) {
      if (sentences.length > 0) {
        sentences[sentences.length - 1] = (sentences[sentences.length - 1] + ' ' + segment).trim();
      } else if (i + 1 < raw.length && raw[i + 1] && raw[i + 1].length > 0) {
        raw[i + 1] = (segment + ' ' + raw[i + 1]).trim();
      } else {
        sentences.push(segment);
      }
    } else {
      sentences.push(segment);
    }
  }
  return sentences.filter(s => s && s.length > 0);
}

async function preview() {
  const filePath = path.resolve(options.file);
  const content = await fs.readFile(filePath, 'utf-8');
  const sentences = splitIntoSentences(content);
  const out = sentences.map((s, idx) => ({
    order_in_story: idx + 1,
    text_devanagari: s,
    text_iast: devanagariToIAST(s),
    char_count: s.length
  }));
  const outPath = path.join(process.cwd(), `story-preview-${path.basename(filePath)}.json`);
  await fs.writeFile(outPath, JSON.stringify({ title: options.title || path.basename(filePath), count: out.length, sentences: out }, null, 2), 'utf-8');
  console.log(`Preview written to: ${outPath}`);
  console.log(`Total sentences: ${out.length}`);
  console.log('\nSample sentences:');
  out.slice(0, 10).forEach(s => console.log(`${s.order_in_story}. ${s.text_devanagari} --> ${s.text_iast}`));
}

preview().catch(err => {
  console.error('Preview failed:', err);
  process.exit(1);
});
