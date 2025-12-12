#!/usr/bin/env node
/**
 * ASR Manifest Export Script
 * Exports approved recordings to NeMo/HF compatible manifest format
 * 
 * Usage:
 *   node scripts/export-asr-manifest.js --output ../konkani_asr/data
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const { program } = require('commander');
const { query, queryAll } = require('../backend/db');
const storage = require('../backend/storage');

// Parse command line arguments
program
    .requiredOption('-o, --output <path>', 'Output directory for manifests and audio')
    .option('--train-ratio <ratio>', 'Train split ratio', '0.8')
    .option('--dev-ratio <ratio>', 'Dev split ratio', '0.1')
    .option('--test-ratio <ratio>', 'Test split ratio', '0.1')
    .option('--min-duration <seconds>', 'Minimum duration', '0.5')
    .option('--max-duration <seconds>', 'Maximum duration', '30')
    .option('--copy-audio', 'Copy audio files (default: symlink)', false)
    .parse();

const options = program.opts();

/**
 * Shuffle array using Fisher-Yates algorithm
 */
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

/**
 * Split recordings into train/dev/test
 */
function splitRecordings(recordings, trainRatio, devRatio, testRatio) {
    const total = recordings.length;
    const trainSize = Math.floor(total * trainRatio);
    const devSize = Math.floor(total * devRatio);
    
    // Shuffle for random split
    const shuffled = shuffleArray(recordings);
    
    return {
        train: shuffled.slice(0, trainSize),
        dev: shuffled.slice(trainSize, trainSize + devSize),
        test: shuffled.slice(trainSize + devSize)
    };
}

/**
 * Write manifest file in JSONL format
 */
async function writeManifest(filePath, recordings, audioDir) {
    const lines = recordings.map(r => {
        // Relative path from manifest to audio file
        const audioPath = path.join('audio', path.basename(r.audio_filepath));
        
        return JSON.stringify({
            audio_filepath: audioPath,
            text: r.text_devanagari,
            duration: r.duration_seconds
        });
    });

    await fs.writeFile(filePath, lines.join('\n') + '\n', 'utf-8');
}

/**
 * Copy or symlink audio file
 */
async function transferAudioFile(sourcePath, destPath, copyMode) {
    try {
        if (copyMode) {
            // Copy file
            await fs.copyFile(sourcePath, destPath);
        } else {
            // Create symlink
            await fs.symlink(sourcePath, destPath);
        }
    } catch (error) {
        // If symlink fails (e.g., Windows permissions), fall back to copy
        if (error.code === 'EPERM' && !copyMode) {
            console.warn(`  ⚠️  Symlink failed, copying instead: ${path.basename(destPath)}`);
            await fs.copyFile(sourcePath, destPath);
        } else {
            throw error;
        }
    }
}

async function exportManifests() {
    try {
        console.log('='.repeat(60));
        console.log('📊 ASR Manifest Exporter');
        console.log('='.repeat(60));
        
        const outputDir = path.resolve(options.output);
        const audioDir = path.join(outputDir, 'audio');
        
        // Parse ratios
        const trainRatio = parseFloat(options.trainRatio);
        const devRatio = parseFloat(options.devRatio);
        const testRatio = parseFloat(options.testRatio);
        const minDuration = parseFloat(options.minDuration);
        const maxDuration = parseFloat(options.maxDuration);

        if (Math.abs(trainRatio + devRatio + testRatio - 1.0) > 0.001) {
            throw new Error('Split ratios must sum to 1.0');
        }

        // 1. Create output directories
        console.log(`Creating directories in: ${outputDir}`);
        await fs.mkdir(outputDir, { recursive: true });
        await fs.mkdir(audioDir, { recursive: true });

        // 2. Fetch approved recordings
        console.log('\nFetching approved recordings...');
        
        const recordings = await queryAll(
            `SELECT 
                r.id,
                r.audio_filepath,
                r.duration_seconds,
                r.file_size_bytes,
                s.text_devanagari
             FROM recordings r
             JOIN sentences s ON r.sentence_id = s.id
             WHERE r.status = 'approved'
               AND r.validation_status = 'valid'
               AND r.duration_seconds >= $1
               AND r.duration_seconds <= $2
             ORDER BY r.created_at`,
            [minDuration, maxDuration]
        );

        if (!recordings || recordings.length === 0) {
            console.log('No approved recordings found');
            console.log('Nothing to export. Create and approve recordings before running this script.');
            process.exit(0);
        }

        console.log(`✓ Found ${recordings.length} approved recordings`);

        // 3. Calculate statistics
        const totalDuration = recordings.reduce((sum, r) => sum + r.duration_seconds, 0);
        const totalSize = recordings.reduce((sum, r) => sum + r.file_size_bytes, 0);
        
        console.log(`  Total duration: ${(totalDuration / 60).toFixed(2)} minutes`);
        console.log(`  Total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);

        // 4. Split into train/dev/test
        console.log('\nSplitting dataset...');
        const splits = splitRecordings(recordings, trainRatio, devRatio, testRatio);
        
        console.log(`  Train: ${splits.train.length} samples (${(splits.train.length / recordings.length * 100).toFixed(1)}%)`);
        console.log(`  Dev:   ${splits.dev.length} samples (${(splits.dev.length / recordings.length * 100).toFixed(1)}%)`);
        console.log(`  Test:  ${splits.test.length} samples (${(splits.test.length / recordings.length * 100).toFixed(1)}%)`);

        // 5. Transfer audio files
        console.log('\nTransferring audio files...');
        const copyMode = options.copyAudio;
        console.log(`  Mode: ${copyMode ? 'COPY' : 'SYMLINK'}`);

        const uploadDir = process.env.UPLOAD_DIR || './uploads';
        
        let transferred = 0;
        for (const recording of recordings) {
            // Handle both absolute and relative paths
            let sourcePath = recording.audio_filepath;
            if (!path.isAbsolute(sourcePath)) {
                // Relative path - resolve from uploads directory
                sourcePath = path.resolve(uploadDir, sourcePath);
            }
            
            const destPath = path.join(audioDir, path.basename(recording.audio_filepath));
            
            await transferAudioFile(sourcePath, destPath, copyMode);
            
            transferred++;
            if (transferred % 10 === 0 || transferred === recordings.length) {
                process.stdout.write(`\r  Transferred: ${transferred}/${recordings.length} files`);
            }
        }
        console.log('\n');

        // 6. Write manifest files
        console.log('Writing manifest files...');
        
        await writeManifest(
            path.join(outputDir, 'train_manifest.json'),
            splits.train,
            audioDir
        );
        console.log(`  ✓ train_manifest.json (${splits.train.length} samples)`);

        await writeManifest(
            path.join(outputDir, 'dev_manifest.json'),
            splits.dev,
            audioDir
        );
        console.log(`  ✓ dev_manifest.json (${splits.dev.length} samples)`);

        await writeManifest(
            path.join(outputDir, 'test_manifest.json'),
            splits.test,
            audioDir
        );
        console.log(`  ✓ test_manifest.json (${splits.test.length} samples)`);

        // 7. Write summary file
        const summary = {
            export_date: new Date().toISOString(),
            total_recordings: recordings.length,
            total_duration_minutes: totalDuration / 60,
            total_size_mb: totalSize / 1024 / 1024,
            splits: {
                train: { count: splits.train.length, ratio: trainRatio },
                dev: { count: splits.dev.length, ratio: devRatio },
                test: { count: splits.test.length, ratio: testRatio }
            },
            audio_format: {
                sample_rate: 16000,
                channels: 1,
                format: 'wav'
            },
            duration_range: {
                min: minDuration,
                max: maxDuration
            }
        };

        await fs.writeFile(
            path.join(outputDir, 'export_summary.json'),
            JSON.stringify(summary, null, 2),
            'utf-8'
        );
        console.log(`  ✓ export_summary.json`);

        // 8. Final summary
        console.log('\n' + '='.repeat(60));
        console.log('✅ Export Complete!');
        console.log('='.repeat(60));
        console.log(`Output directory: ${outputDir}`);
        console.log(`\nFiles created:`);
        console.log(`  - train_manifest.json`);
        console.log(`  - dev_manifest.json`);
        console.log(`  - test_manifest.json`);
        console.log(`  - export_summary.json`);
        console.log(`  - audio/ (${recordings.length} files)`);
        console.log('\nNext steps:');
        console.log(`  cd ../konkani_asr`);
        console.log(`  # Use manifests for training`);
        console.log('='.repeat(60));

        process.exit(0);

    } catch (error) {
        console.error('\n❌ Export failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run export
exportManifests();
