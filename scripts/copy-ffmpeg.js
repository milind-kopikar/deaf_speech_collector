#!/usr/bin/env node
const fs = require('fs').promises;
const path = require('path');

const DEFAULT_SOURCE = path.join('..', 'konkani_asr', 'ffmpeg', 'ffmpeg-8.0.1-essentials_build', 'bin');
const DEFAULT_DEST = path.join(process.cwd(), 'vendor', 'ffmpeg', 'bin');

(async () => {
  const sourceDir = process.env.FFMPEG_SOURCE || DEFAULT_SOURCE;
  const destDir = process.env.FFMPEG_DEST || DEFAULT_DEST;
  console.log('Copying ffmpeg from', sourceDir, 'to', destDir);
  try {
    await fs.mkdir(destDir, { recursive: true });
    const files = ['ffmpeg.exe', 'ffprobe.exe', 'ffplay.exe'];
    for (const f of files) {
      const src = path.join(sourceDir, f);
      try {
        await fs.copyFile(src, path.join(destDir, f));
        console.log('Copied', f);
      } catch (err) {
        console.warn('Cannot copy', f, 'from', src, ' - may not exist', err.message);
      }
    }
    console.log('ffmpeg copy complete. You can optionally set FFMPEG_PATH and FFPROBE_PATH environment variables to the files in', destDir);
  } catch (err) {
    console.error('Failed to copy ffmpeg:', err.message);
    process.exit(1);
  }
})();
