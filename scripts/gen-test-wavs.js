const fs = require('fs');
const path = require('path');

function writeWav(filePath, durationSec, freq=440, sampleRate=16000) {
  const samples = Math.floor(durationSec * sampleRate);
  const buffer = Buffer.alloc(44 + samples * 2); // 16-bit mono

  // WAV header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples*2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // PCM header length
  buffer.writeUInt16LE(1, 20); // PCM format
  buffer.writeUInt16LE(1, 22); // channels
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples * 2, 40);

  // Write samples (sine wave)
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const amp = Math.sin(2 * Math.PI * freq * t) * 0.5;
    const val = Math.max(-1, Math.min(1, amp));
    const int16 = Math.floor(val * 32767);
    buffer.writeInt16LE(int16, 44 + i*2);
  }

  fs.writeFileSync(filePath, buffer);
  console.log('Wrote WAV', filePath, 'duration', durationSec);
}

const outDir = path.join(process.cwd(), 'tmp');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
writeWav(path.join(outDir, 'valid.wav'), 3.0);
writeWav(path.join(outDir, 'invalid.wav'), 0.2);

console.log('Done');
