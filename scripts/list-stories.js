#!/usr/bin/env node
require('dotenv').config();
const { queryAll } = require('../backend/db');

(async () => {
  try {
    const stories = await queryAll('SELECT id, title, source_file, total_sentences, created_at FROM stories ORDER BY id');
    console.log('Current stories (id, title, source_file, total_sentences, created_at):');
    stories.forEach(s => console.log(`${s.id}	${s.title}	${s.source_file}	${s.total_sentences}	${s.created_at}`));
    process.exit(0);
  } catch (e) {
    console.error('Error listing stories:', e);
    process.exit(1);
  }
})();
