#!/usr/bin/env node
const fs = require('fs');

const manifestPath = './exported/manifest.jsonl';
const lines = fs.readFileSync(manifestPath, 'utf8').split('\n').filter(l => l.trim());

console.log('\n=== EXPORTED AUDIO-SENTENCE PAIRS ===\n');
console.log(`Total recordings: ${lines.length}\n`);

lines.forEach((line, i) => {
    const data = JSON.parse(line);
    console.log(`${i + 1}. Recording ${data.recording_id}:`);
    console.log(`   Audio: ${data.audio_filepath} (${data.duration_seconds}s)`);
    console.log(`   Devanagari: ${data.sentence_text}`);
    console.log(`   IAST: ${data.sentence_text_iast}`);
    console.log(`   Story: ${data.story_title}`);
    console.log('');
});

console.log(`Files saved to:`);
console.log(`  - Manifest: exported/manifest.jsonl`);
console.log(`  - Audio: exported/audio/*.wav`);
console.log('');
