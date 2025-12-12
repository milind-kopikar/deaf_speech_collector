#!/usr/bin/env node
require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;
const { program } = require('commander');
const { queryAll, query, queryOne } = require('../backend/db');
const storage = require('../backend/storage');
const { convertToWav, getAudioMetadata } = require('../backend/utils/audioConverter');
const { validateAudio } = require('../backend/utils/audioValidator');

(async () => {
        try {
        const meta = await getAudioMetadata(tmpLocalPath).catch(() => null);
        const isWav = meta && meta.format === 'wav' && meta.sample_rate === 16000 && meta.channels === 1;
        if (!isWav) {
          if (!ffmpegAvailable) {
            console.warn('ffmpeg not available; skipping conversion for id', row.id);
          } else if (!dryRun) {
            const outLocal = tmpLocalPath.replace(path.extname(tmpLocalPath), '-converted.wav');
            await convertToWav(tmpLocalPath, outLocal);
            newLocalPath = outLocal;
          } else {
            console.log('[dry-run] Would convert', tmpLocalPath, '-> wav');
          }
        } else {
          console.log('Already WAV and correct format locally');
        }
        // Trim silence if ffmpeg is available and not already done
        if (ffmpegAvailable && newLocalPath) {
          const outTrim = newLocalPath.replace('.wav', '-trimmed.wav');
          if (!dryRun) {
            try { await require('../backend/utils/audioConverter').trimSilence(newLocalPath, outTrim); newLocalPath = outTrim; } catch (e) { console.warn('Trim silence failed for id', row.id, e.message); }
          } else {
            console.log('[dry-run] Would trim silence for', newLocalPath);
          }
        }
  let sql = `SELECT id, sentence_id, user_id, audio_filepath, format, validation_status, validation_errors FROM recordings WHERE id > $1`;
  const args = [startId];
  sql += ` ORDER BY id ASC LIMIT $2`;

  let processed = 0;
  // Detect ffmpeg availability
  let ffmpegAvailable = true;
  try {
    require('child_process').execSync('ffmpeg -version', { stdio: 'ignore' });
    require('child_process').execSync('ffprobe -version', { stdio: 'ignore' });
  } catch (err) {
    console.warn('ffmpeg/ffprobe not available in PATH. Conversions/validation requiring ffmpeg will be skipped.');
    ffmpegAvailable = false;
  }
  let lastId = startId;
  while (processed < limit) {
    const batch = await queryAll(sql, [lastId, Math.min(batchSize, limit - processed)]);
    if (!batch || batch.length === 0) break;

    for (const row of batch) {
      if (skipWav && (row.format || '').toLowerCase() === 'wav' && row.validation_status === 'passed') {
        console.log(`Skipping id=${row.id} (already WAV and passed)`);
        lastId = row.id; processed++; continue;
      }

      console.log(`Processing id=${row.id} format=${row.format} status=${row.validation_status}`);
      // Get file from storage (local fs path or s3 key)
      const filepath = row.audio_filepath;
      if (!filepath) { console.warn('No filepath for id', row.id); lastId = row.id; processed++; continue; }

      // Ensure local copy
      const tmpLocalPath = path.join(process.cwd(), '.tmp', `rec_${row.id}_${path.basename(filepath)}`);
      await fs.mkdir(path.dirname(tmpLocalPath), { recursive: true });
      try {
        const stream = await storage.getStream(filepath);
        const writeStream = require('fs').createWriteStream(tmpLocalPath);
        await new Promise((resolve, reject) => {
          stream.pipe(writeStream).on('finish', resolve).on('error', reject);
        });
      } catch (e) {
        console.error('Failed to download file from storage for id', row.id, e.message);
        lastId = row.id; processed++; continue;
      }

      // Convert to WAV if needed
      let newLocalPath = tmpLocalPath;
      try {
        const meta = await getAudioMetadata(tmpLocalPath).catch(() => null);
        const isWav = meta && meta.format === 'wav' && meta.sample_rate === 16000 && meta.channels === 1;
            if (!isWav) {
          if (!ffmpegAvailable) {
            console.warn('ffmpeg not available; skipping conversion for id', row.id);
          } else if (!dryRun) {
          // Ensure output file is not same as input
          const outLocal = tmpLocalPath.replace(path.extname(tmpLocalPath), '-converted.wav');
            await convertToWav(tmpLocalPath, outLocal);
            // Remove original temp (if we want to)
            // await fs.unlink(tmpLocalPath).catch(() => {});
            newLocalPath = outLocal;
          } else {
            console.log('[dry-run] Would convert', tmpLocalPath, '-> wav');
          }
        } else {
          console.log('Already WAV and correct format locally');
        }
      } catch (e) {
        console.error('Conversion failed for id', row.id, e.message);
      }

      // Re-validate and update DB
      try {
        const audioMeta = await getAudioMetadata(newLocalPath).catch(() => null);
        const validation = audioMeta ? (await validateAudio(newLocalPath, '')) : { valid: false, errors: ['Unable to read metadata'] };
        console.log('Validation result for id', row.id, validation);

        // Save WAV to storage and update db
        if (!dryRun && newLocalPath) {
          // Generate new filename
          const newFilename = `recordings/${row.user_id.replace(/[^a-z0-9]/gi, '_')}_${row.sentence_id}_${require('uuid').v4()}.wav`;
          const storedKey = await storage.save(newLocalPath, newFilename);
          const fileSize = await storage.getSize(storedKey);
          const updateRes = await query(
            `UPDATE recordings SET audio_filepath = $1, file_size_bytes = $2, duration_seconds = $3, sample_rate = $4, channels = $5, format = $6, validation_status = $7, validation_errors = $8, audio_metadata = $9 WHERE id = $10 RETURNING id`,
            [storedKey, fileSize, validation.checks.duration, validation.checks.sample_rate, validation.checks.channels, 'wav', validation.valid ? 'passed' : 'failed', JSON.stringify(validation.errors), JSON.stringify(validation.metadata || {}), row.id]
          );
          console.log('Updated recording id', row.id);
        }
      } catch (e) {
        console.error('Failed to save/validate/update DB for id', row.id, e.message);
      }

      lastId = row.id;
      processed++; 
    }
  }

  console.log('Done processing recordings');
  process.exit(0);
})();
