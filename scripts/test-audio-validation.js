/**
 * Test Audio Validation
 * Creates a minimal test audio file and checks validation
 * 
 * Usage: node scripts/test-audio-validation.js
 */

const { validateAudio } = require('../backend/utils/audioValidator');
const { convertToWav } = require('../backend/utils/audioConverter');
const fs = require('fs').promises;
const path = require('path');

async function createTestWav(filePath, duration = 2.0, sampleRate = 16000) {
    // Create a minimal valid WAV file
    const numSamples = Math.floor(duration * sampleRate);
    const dataSize = numSamples * 2; // 16-bit samples
    const fileSize = 44 + dataSize;
    
    const buffer = Buffer.alloc(fileSize);
    
    // WAV header
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(fileSize - 8, 4);
    buffer.write('WAVE', 8);
    
    // fmt chunk
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // chunk size
    buffer.writeUInt16LE(1, 20); // audio format (1 = PCM)
    buffer.writeUInt16LE(1, 22); // num channels (1 = mono)
    buffer.writeUInt32LE(sampleRate, 24); // sample rate
    buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
    buffer.writeUInt16LE(2, 32); // block align
    buffer.writeUInt16LE(16, 34); // bits per sample
    
    // data chunk
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);
    
    // Fill with simple sine wave to avoid "silence" detection
    for (let i = 0; i < numSamples; i++) {
        const sample = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 16384; // 440Hz tone
        buffer.writeInt16LE(Math.round(sample), 44 + i * 2);
    }
    
    await fs.writeFile(filePath, buffer);
    console.log(`✅ Created test WAV: ${filePath} (${duration}s, ${sampleRate}Hz)`);
}

async function runTests() {
    console.log('\n========================================');
    console.log('Audio Validation Test Suite');
    console.log('========================================\n');
    
    const testDir = path.join(__dirname, '../tmp');
    await fs.mkdir(testDir, { recursive: true });
    
    const tests = [
        { name: 'Valid 2s recording', duration: 2.0, text: 'यह एक परीक्षण वाक्य है', shouldPass: true },
        { name: 'Valid 3s recording', duration: 3.0, text: 'यह एक परीक्षण वाक्य है', shouldPass: true },
        { name: 'Valid 5s recording', duration: 5.0, text: 'यह एक बहुत लंबा परीक्षण वाक्य है जो अधिक समय लेता है', shouldPass: true },
        { name: 'Too short (0.3s)', duration: 0.3, text: 'छोटा', shouldPass: false },
        { name: 'Valid 1s recording', duration: 1.0, text: 'छोटा वाक्य', shouldPass: true },
    ];
    
    for (const test of tests) {
        console.log(`\nTest: ${test.name}`);
        console.log('-'.repeat(50));
        
        const testFile = path.join(testDir, `test_${test.duration}s.wav`);
        
        try {
            await createTestWav(testFile, test.duration);
            
            const result = await validateAudio(testFile, test.text);
            
            console.log(`Valid: ${result.valid ? '✅ Yes' : '❌ No'}`);
            console.log(`Duration: ${result.checks.duration}s (expected ~${result.checks.expected_duration?.toFixed(1)}s)`);
            console.log(`Sample Rate: ${result.checks.sample_rate}Hz`);
            console.log(`Channels: ${result.checks.channels}`);
            console.log(`Format: ${result.checks.format}`);
            
            if (result.errors && result.errors.length > 0) {
                console.log('\nErrors:');
                result.errors.forEach(err => console.log(`  ❌ ${err}`));
            }
            
            if (test.shouldPass && !result.valid) {
                console.log('\n⚠️  Expected to PASS but FAILED');
            } else if (!test.shouldPass && result.valid) {
                console.log('\n⚠️  Expected to FAIL but PASSED');
            } else {
                console.log('\n✅ Test result matches expectation');
            }
            
            // Cleanup
            await fs.unlink(testFile);
            
        } catch (error) {
            console.error(`❌ Test failed: ${error.message}`);
        }
    }
    
    console.log('\n========================================');
    console.log('Test Suite Complete');
    console.log('========================================\n');
}

runTests().catch(console.error);
