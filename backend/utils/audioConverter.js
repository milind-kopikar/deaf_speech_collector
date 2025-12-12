/**
 * Audio format converter using ffmpeg
 * Converts any audio format to 16kHz mono WAV
 */

const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const os = require('os');

// If env vars are set for ffmpeg/ffprobe paths, instruct fluent-ffmpeg to use them
if (process.env.FFMPEG_PATH) {
    try { ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH); console.log('fluent-ffmpeg: using FFMPEG_PATH', process.env.FFMPEG_PATH); } catch (e) {}
}
if (process.env.FFPROBE_PATH) {
    try { ffmpeg.setFfprobePath(process.env.FFPROBE_PATH); console.log('fluent-ffmpeg: using FFPROBE_PATH', process.env.FFPROBE_PATH); } catch (e) {}
}
// If not defined, look for vendor/ffmpeg/bin relative to project root (copied from konkani_asr)
if (!process.env.FFMPEG_PATH || !process.env.FFPROBE_PATH) {
    const vendorDir = path.join(process.cwd(), 'vendor', 'ffmpeg', 'bin');
    const ffmpegBinary = path.join(vendorDir, os.platform() === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
    const ffprobeBinary = path.join(vendorDir, os.platform() === 'win32' ? 'ffprobe.exe' : 'ffprobe');
    try {
        // If the files exist, set paths
        const fsSync = require('fs');
        if (fsSync.existsSync(ffmpegBinary)) {
            ffmpeg.setFfmpegPath(ffmpegBinary);
            console.log('fluent-ffmpeg: using vendor ffmpeg at', ffmpegBinary);
        }
        if (fsSync.existsSync(ffprobeBinary)) {
            ffmpeg.setFfprobePath(ffprobeBinary);
            console.log('fluent-ffmpeg: using vendor ffprobe at', ffprobeBinary);
        }
    } catch (e) {
        // ignore
    }
}
const fs = require('fs').promises;
const fsSync = require('fs');
const child_process = require('child_process');

/**
 * Convert audio file to 16kHz mono WAV
 * @param {string} inputPath - Path to input audio file
 * @param {string} outputPath - Path for output WAV file (optional)
 * @returns {Promise<string>} - Path to converted WAV file
 */
async function convertToWav(inputPath, outputPath = null) {
    // Generate output path if not provided
    if (!outputPath) {
        const ext = path.extname(inputPath);
        outputPath = inputPath.replace(ext, '.wav');
    }

    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .audioFrequency(16000)      // 16kHz sample rate
            .audioChannels(1)            // Mono
            .audioCodec('pcm_s16le')     // 16-bit PCM
            .format('wav')               // WAV container
            .on('start', (commandLine) => {
                console.log('FFmpeg command:', commandLine);
            })
            .on('end', () => {
                console.log(`✓ Converted to WAV: ${outputPath}`);
                resolve(outputPath);
            })
            .on('error', (err) => {
                console.error('FFmpeg conversion error:', err);
                reject(new Error(`Audio conversion failed: ${err.message}`));
            })
            .save(outputPath);
    });
}

/**
 * Get audio file metadata using ffprobe
 * @param {string} filePath
 * @returns {Promise<object>} Metadata object
 */
async function getAudioMetadata(filePath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) {
                reject(new Error(`Failed to probe audio: ${err.message}`));
                return;
            }

            const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
            
            if (!audioStream) {
                reject(new Error('No audio stream found in file'));
                return;
            }

            resolve({
                format: metadata.format.format_name,
                duration: parseFloat(metadata.format.duration) || 0,
                sample_rate: parseInt(audioStream.sample_rate) || 0,
                channels: audioStream.channels || 0,
                bit_rate: parseInt(metadata.format.bit_rate) || 0,
                file_size: parseInt(metadata.format.size) || 0,
                codec: audioStream.codec_name,
            });
        });
    });
}

/**
 * Trim silence from start and end of an audio file using ffmpeg `silenceremove` filter
 * @param {string} inputPath
 * @param {string} outputPath
 * @returns {Promise<string>} outputPath
 */
async function trimSilence(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        // Remove silence at start and end; thresholds are adjustable
        const filter = "silenceremove=start_periods=1:start_duration=0.2:start_threshold=-45dB:stop_periods=1:stop_duration=0.2:stop_threshold=-45dB";
        ffmpeg(inputPath)
            .audioFilters(filter)
            .format('wav')
            .on('start', (cmd) => console.log('FFmpeg trimSilence command:', cmd))
            .on('end', () => {
                console.log(`✓ Trimmed silence to ${outputPath}`);
                resolve(outputPath);
            })
            .on('error', (err) => {
                console.error('FFmpeg trimSilence error:', err);
                reject(err);
            })
            .save(outputPath);
    });
}

/**
 * Check if file is already in correct WAV format
 * @param {string} filePath
 * @returns {Promise<boolean>}
 */
async function isValidWav(filePath) {
    try {
        const metadata = await getAudioMetadata(filePath);
        return (
            metadata.format === 'wav' &&
            metadata.sample_rate === 16000 &&
            metadata.channels === 1
        );
    } catch (error) {
        return false;
    }
}

module.exports = {
    convertToWav,
    getAudioMetadata,
    isValidWav,
    trimSilence,
    /**
     * Check if ffmpeg/ffprobe are available in the environment
     * 
     * Searches for ffmpeg binaries in the following order (first found wins):
     * 1. FFMPEG_PATH environment variable - explicit path set by user/deployment
     * 2. vendor/ffmpeg/bin directory - bundled binaries for offline/portable use
     * 3. Global system PATH - system-installed ffmpeg
     * 
     * This resolution order allows:
     * - Production deployments to specify exact paths via env vars
     * - Development with vendored binaries (no global install required)
     * - Fallback to system ffmpeg if available
     * 
     * @returns {boolean} true if both ffmpeg and ffprobe are accessible
     */
    isFfmpegAvailable: function () {
        // If fluent-ffmpeg already has a path set via environment, consider available
        if (process.env.FFMPEG_PATH && fsSync.existsSync(process.env.FFMPEG_PATH)) return true;
        // Vendor binaries
        const vendorDir = path.join(process.cwd(), 'vendor', 'ffmpeg', 'bin');
        const ffmpegBinary = path.join(vendorDir, os.platform() === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
        const ffprobeBinary = path.join(vendorDir, os.platform() === 'win32' ? 'ffprobe.exe' : 'ffprobe');
        if (fsSync.existsSync(ffmpegBinary) && fsSync.existsSync(ffprobeBinary)) return true;
        // Check global path (may throw)
        try {
            child_process.execSync('ffmpeg -version', { stdio: 'ignore' });
            child_process.execSync('ffprobe -version', { stdio: 'ignore' });
            return true;
        } catch (e) {
            return false;
        }
    },
};
