/**
 * Recording upload API (web interface)
 * POST /api/recordings - Upload recording from web form
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const { query, queryOne } = require('../db');
const storage = require('../storage');
const { convertToWav, isValidWav } = require('../utils/audioConverter');
const { validateAudio } = require('../utils/audioValidator');
const { validateRecordingUpload } = require('../middleware/validator');

// Configure multer for temporary file uploads
const upload = multer({
    dest: '/tmp/uploads/',
    limits: {
        fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB) || 10) * 1024 * 1024,
    },
    fileFilter: (req, file, cb) => {
        // Accept any audio format
        const allowedMimes = [
            'audio/wav', 'audio/wave', 'audio/x-wav',
            'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a',
            'audio/ogg', 'audio/opus', 'audio/webm',
        ];
        if (allowedMimes.includes(file.mimetype) || file.originalname.match(/\.(wav|mp3|m4a|ogg|opus|webm)$/i)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid audio format'));
        }
    },
});

// POST /api/recordings
router.post('/', upload.single('audio'), validateRecordingUpload, async (req, res, next) => {
    console.log('POST /api/recordings received');
    console.log('File info:', req.file && { originalname: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size });
    console.log('Body:', { sentence_id: req.body.sentence_id, user_id: req.body.user_id });
    
    const { sentence_id } = req.body;
    let { user_id } = req.body;
    
    // Normalize user_id to lowercase for consistency
    user_id = user_id.toLowerCase().trim();
    
    const tempFilePath = req.file.path;

    try {
        // 1. Get sentence details
        const sentence = await queryOne(
            'SELECT text_devanagari, story_id FROM sentences WHERE id = $1',
            [sentence_id]
        );

        if (!sentence) {
            await fs.unlink(tempFilePath);
            return res.status(404).json({ error: 'Sentence not found' });
        }

        // 2. Convert to WAV if needed; gracefully fall back when ffmpeg is missing
        let wavPath = tempFilePath;
        let shouldConvert = false;
        try {
            shouldConvert = !(await isValidWav(tempFilePath));
            console.log('isValidWav result:', !shouldConvert);
        } catch (e) {
            // If isValidWav throws (e.g., ffprobe not found), consider fallback behavior:
            console.warn('isValidWav failed:', e.message);
            // If file extension is not .wav, we'll attempt to convert and may fail if ffmpeg is missing.
            // If extension is .wav, we'll skip conversion and hope it's acceptable.
            // Use original filename to decide; multer temp path may not have extension
            const originalExt = path.extname(req.file.originalname || '').toLowerCase();
            console.warn('isValidWav check failed:', e.message, '-> originalExt', originalExt, 'originalname', req.file.originalname);
            shouldConvert = originalExt !== '.wav';
        }

        // Check if ffmpeg is available in the environment.
        const { isFfmpegAvailable } = require('../utils/audioConverter');
        let ffmpegAvailable = isFfmpegAvailable();
        console.log('ffmpegAvailable:', ffmpegAvailable);

        if (shouldConvert && !ffmpegAvailable) {
            console.warn('ffmpeg not present — skipping conversion for', req.file.originalname);
            shouldConvert = false;
        }

        if (shouldConvert) {
            try {
                console.log('Converting audio to WAV format...');
                wavPath = path.join('/tmp', `${uuidv4()}.wav`);
                await convertToWav(tempFilePath, wavPath);
                await fs.unlink(tempFilePath); // Clean up original
                console.log('Conversion completed, wavPath:', wavPath);
            } catch (conversionErr) {
                // If conversion fails because ffmpeg is missing, return a helpful error
                console.error('Audio conversion error:', conversionErr);
                await fs.unlink(tempFilePath).catch(() => {});
                return res.status(500).json({ error: `Audio conversion failed: ${conversionErr.message}` });
            }
        }

        // 3. Validate audio (no silence trimming to preserve full recordings)
        let validation;
        try {
            validation = await validateAudio(wavPath, sentence.text_devanagari);
            console.log('Post-validation: valid=', validation.valid, 'errors=', validation.errors, 'checks=', validation.checks);
            // If validation returned with errors, respond with 422 and do not save
            if (!validation.valid) {
                console.warn('Validation returned invalid; returning 422 to client', validation.errors);
                try { if (tempFilePath) await fs.unlink(tempFilePath); if (wavPath && wavPath !== tempFilePath) await fs.unlink(wavPath); } catch (cleanupErr) {}
                return res.status(422).json({ error: 'Validation failed', validation });
            }
        } catch (e) {
            console.warn('validateAudio failed; sending validation error to client:', e.message);
            try { if (tempFilePath) await fs.unlink(tempFilePath); if (wavPath && wavPath !== tempFilePath) await fs.unlink(wavPath); } catch {}
            return res.status(422).json({ error: 'Validation failed', validation: { valid: false, errors: [e.message] } });
        }

        // 4. Generate storage filename
        const filename = `recordings/${user_id.replace(/[^a-z0-9]/gi, '_')}_${sentence_id}_${uuidv4()}.wav`;

        // 5. Save to storage
        const storedPath = await storage.save(wavPath, filename);

        // 6. Get file size
        const fileSize = await storage.getSize(storedPath);
        console.log('Saved to storage:', storedPath, 'size:', fileSize);

        // 7. Insert database record
        const result = await queryOne(
            `INSERT INTO recordings (
                sentence_id, user_id, audio_filepath,
                file_size_bytes, duration_seconds, sample_rate, channels, format,
                validation_status, validation_errors, audio_metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING id`,
            [
                sentence_id,
                user_id,
                storedPath,
                fileSize,
                validation.checks.duration,
                validation.checks.sample_rate,
                validation.checks.channels,
                'wav',
                (function () {
                    if (validation.valid) return 'passed';
                    if (!ffmpegAvailable) return 'warning';
                    return 'failed';
                })(),
                JSON.stringify(validation.errors),
                JSON.stringify(validation.metadata),
            ]
        );

        // 8. Clean up temp file
        await fs.unlink(wavPath);

        // 9. Return response
        console.log('Inserting DB record for path:', storedPath);
        res.json({
            recording_id: result.id,
            status: 'success',
            message: 'Recording saved successfully',
            validation: {
                valid: validation.valid,
                errors: validation.errors,
                duration: validation.checks.duration,
            },
        });

    } catch (error) {
        console.error('Error in POST /api/recordings:', error);
        // Clean up temp files on error
        try {
            if (tempFilePath) await fs.unlink(tempFilePath);
            if (wavPath && wavPath !== tempFilePath) await fs.unlink(wavPath);
        } catch {}
        
        next(error);
    }
});

// GET /api/recordings - List all recordings with details for review
// Only shows the most recent recording per sentence per user
router.get('/', async (req, res) => {
    try {
        const result = await query(
            `WITH ranked_recordings AS (
                SELECT 
                    r.id,
                    r.audio_filepath,
                    r.duration_seconds as duration,
                    r.status,
                    r.created_at,
                    r.user_id,
                    s.id as sentence_id,
                    s.order_in_story,
                    s.text_devanagari as sentence_text,
                    st.id as story_id,
                    st.title as story_title,
                    ROW_NUMBER() OVER (
                        PARTITION BY r.sentence_id, r.user_id 
                        ORDER BY r.created_at DESC
                    ) as rn
                FROM recordings r
                JOIN sentences s ON r.sentence_id = s.id
                JOIN stories st ON s.story_id = st.id
            )
            SELECT 
                id, audio_filepath, duration, status, created_at, user_id,
                sentence_id, order_in_story, sentence_text, story_id, story_title
            FROM ranked_recordings
            WHERE rn = 1
            ORDER BY story_id ASC, order_in_story ASC, created_at DESC`
        );

        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching recordings:', error);
        res.status(500).json({ error: 'Failed to fetch recordings' });
    }
});

// PATCH /api/recordings/:id - Update recording status
router.patch('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['pending', 'approved', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'status must be pending, approved, or rejected' });
        }

        const result = await query(
            `UPDATE recordings 
             SET status = $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2
             RETURNING *`,
            [status, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Recording not found' });
        }

        res.json({
            message: 'Recording updated successfully',
            recording: result.rows[0]
        });

    } catch (error) {
        console.error('Error updating recording:', error);
        res.status(500).json({ error: 'Failed to update recording' });
    }
});

// GET /api/recordings/:id/audio - Get audio file for a recording
router.get('/:id/audio', async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await query(
            'SELECT audio_filepath FROM recordings WHERE id = $1',
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Recording not found' });
        }
        
        const audioFilepath = result.rows[0].audio_filepath;
        
        // Use storage abstraction to get the file (works with both local and S3)
        const audioStream = await storage.getStream(audioFilepath);
        
        if (!audioStream) {
            return res.status(404).json({ error: 'Audio file not found' });
        }
        
        // Set proper headers for audio streaming
        res.set({
            'Content-Type': 'audio/wav',
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'public, max-age=31536000', // Cache for 1 year since recordings don't change
        });
        
        // Stream the audio file
        audioStream.pipe(res);
        
    } catch (error) {
        console.error('Error fetching audio:', error);
        res.status(500).json({ error: 'Failed to fetch audio' });
    }
});

// DELETE /api/recordings/:id - Delete a recording (for re-recording)
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Get the audio filepath before deleting
        const result = await query(
            'SELECT audio_filepath FROM recordings WHERE id = $1',
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Recording not found' });
        }
        
        const audioPath = path.join(__dirname, '../../uploads', result.rows[0].audio_filepath);
        
        // Delete from database
        await query('DELETE FROM recordings WHERE id = $1', [id]);
        
        // Try to delete the audio file (don't fail if it doesn't exist)
        try {
            if (require('fs').existsSync(audioPath)) {
                require('fs').unlinkSync(audioPath);
            }
        } catch (err) {
            console.warn('Failed to delete audio file:', err);
        }
        
        res.json({ message: 'Recording deleted successfully' });
        
    } catch (error) {
        console.error('Error deleting recording:', error);
        res.status(500).json({ error: 'Failed to delete recording' });
    }
});

module.exports = router;
