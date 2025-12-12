#!/usr/bin/env node
require('dotenv').config();
const { program } = require('commander');
const path = require('path');
const fs = require('fs').promises;
const storage = require('../backend/storage');
const { queryOne, query } = require('../backend/db');
const { convertToWav, getAudioMetadata } = require('../backend/utils/audioConverter');
const { validateAudio } = require('../backend/utils/audioValidator');
const { v4: uuidv4 } = require('uuid');

program.option('--id <n>', 'Recording id to convert');
program.parse();
const options = program.opts();
const id = parseInt(options.id, 10);
if (!id) {
  console.error('Please supply --id <recording id>');
  process.exit(1);
}

(async () => {
  try {
    const rec = await queryOne('SELECT id, audio_filepath, user_id, sentence_id, format FROM recordings WHERE id = $1', [id]);
    if (!rec) { console.error('Recording not found'); process.exit(1); }

    const tmp = path.join(process.cwd(), '.tmp', `rec_${id}_${path.basename(rec.audio_filepath)}`);
    await fs.mkdir(path.dirname(tmp), { recursive: true });
    const stream = await storage.getStream(rec.audio_filepath);
    const writeStream = require('fs').createWriteStream(tmp);
    await new Promise((resolve, reject) => stream.pipe(writeStream).on('finish', resolve).on('error', reject));

    // Convert to wav
    // Avoid writing output to same filename as input; append '-converted'
    const outLocal = tmp.replace(path.extname(tmp), `-converted.wav`);
    await convertToWav(tmp, outLocal);

    // Validate
    const validation = await validateAudio(outLocal);
    const newFilename = `recordings/${rec.user_id.replace(/[^a-z0-9]/gi, '_')}_${rec.sentence_id}_${uuidv4()}.wav`;
    const storedKey = await storage.save(outLocal, newFilename);
    const fileSize = await storage.getSize(storedKey);
    await query(`UPDATE recordings SET audio_filepath = $1, file_size_bytes = $2, duration_seconds = $3, sample_rate = $4, channels = $5, format = $6, validation_status = $7, validation_errors = $8, audio_metadata = $9 WHERE id = $10`, [storedKey, fileSize, validation.checks.duration, validation.checks.sample_rate, validation.checks.channels, 'wav', validation.valid ? 'passed' : 'failed', JSON.stringify(validation.errors), JSON.stringify(validation.metadata || {}), id]);
    console.log('Converted and updated recording', id, '->', storedKey);
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
