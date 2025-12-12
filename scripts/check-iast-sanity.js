#!/usr/bin/env node
require('dotenv').config();
const { queryAll } = require('../backend/db');

(async () => {
  try {
    const rows = await queryAll('SELECT id, text_devanagari, text_iast FROM sentences;');
    const bad = [];
    for (const r of rows) {
      // Check for any unexpected Devanagari or non-Latin letters in IAST
      if (/[\u0900-\u097F]/.test(r.text_iast)) {
        bad.push({ id: r.id, reason: 'Contains Devanagari', text_devanagari: r.text_devanagari, text_iast: r.text_iast });
      }
      // Additional checks could be implemented here (e.g., non-Latin letters) if needed
    }

    if (bad.length === 0) {
      console.log('All IAST entries look clean (no Devanagari codepoints found).');
    } else {
      console.error(`Found ${bad.length} entries with Devanagari codepoints in IAST:`);
      bad.slice(0, 50).forEach(b => {
        console.log(`ID ${b.id}: ${b.text_devanagari} || ${b.text_iast}`);
      });
    }
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();
