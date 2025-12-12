#!/usr/bin/env node
const { execSync } = require('child_process');

function check(cmd) {
  try {
    const out = execSync(cmd + ' -version', { stdio: 'pipe' }).toString();
    console.log(`${cmd} available:`);
    console.log(out.split('\n')[0]);
    return true;
  } catch (e) {
    console.log(`${cmd} not found`);
    return false;
  }
}

const ffmpegOk = check('ffmpeg');
const ffprobeOk = check('ffprobe');

if (!ffmpegOk || !ffprobeOk) {
  console.log('ffmpeg/ffprobe not available. Install and add to PATH before running conversion scripts.');
  process.exit(1);
}
process.exit(0);
