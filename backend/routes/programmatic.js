/**
 * Programmatic API routes (for WhatsApp bots, mobile apps, etc.)
 * Provides JSON-based access to recording system
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const { query, queryOne } = require('../db');
const storage = require('../storage');
const { convertToWav } = require('../utils/audioConverter');
const { validateAudio } = require('../utils/audioValidator');

const upload = multer({
    dest: '/tmp/uploads/',
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

/**
 * POST /api/programmatic/sentence
 * Get a sentence for recording (random or specific)
 * Body: { story_id?: number, sentence_id?: number, random?: boolean }
 */
router.post('/sentence', async (req, res, next) => {
    try {
        const { story_id, sentence_id, random } = req.body;

        let sentence;

        if (sentence_id) {
            // Get specific sentence
            sentence = await queryOne(`
                SELECT
                    s.id as sentence_id,
                    s.text_devanagari,
                    s.text_iast,
                    s.order_in_story,
                    st.title as story_title,
                    st.total_sentences
                FROM sentences s
                JOIN stories st ON st.id = s.story_id
                WHERE s.id = $1
            `, [sentence_id]);
        } else if (story_id) {
            // Get first unrecorded sentence from story
            sentence = await queryOne(`
                SELECT
                    s.id as sentence_id,
                    s.text_devanagari,
                    s.text_iast,
                    s.order_in_story,
                    st.title as story_title,
                    st.total_sentences
                FROM sentences s
                JOIN stories st ON st.id = s.story_id
                WHERE s.story_id = $1
                ORDER BY s.order_in_story ASC
                LIMIT 1
            `, [story_id]);
        } else if (random) {
            // Get random sentence
            sentence = await queryOne(`
                SELECT
                    s.id as sentence_id,
                    s.text_devanagari,
                    s.text_iast,
                    s.order_in_story,
                    st.title as story_title,
                    st.total_sentences
                FROM sentences s
                JOIN stories st ON st.id = s.story_id
                ORDER BY RANDOM()
                LIMIT 1
            `);
        } else {
            return res.status(400).json({
                error: 'Must provide sentence_id, story_id, or random=true'
            });
        }

        if (!sentence) {
            return res.status(404).json({ error: 'No sentence found' });
        }

        res.json(sentence);

    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/programmatic/upload
 * Upload recording via programmatic API
 * Accepts multipart form or JSON with base64 audio
 */
router.post('/upload', upload.single('audio'), async (req, res, next) => {
    let tempFilePath = null;
    let wavPath = null;

    try {
        const { sentence_id, user_id, format } = req.body;

        // Validate inputs
        if (!sentence_id || !user_id) {
            return res.status(400).json({
                error: 'sentence_id and user_id are required'
            });
        }

        // Get sentence
        const sentence = await queryOne(
            'SELECT text_devanagari FROM sentences WHERE id = $1',
            [sentence_id]
        );

        if (!sentence) {
            return res.status(404).json({ error: 'Sentence not found' });
        }

        // Handle file upload (multipart) or base64
        if (req.file) {
            tempFilePath = req.file.path;
        } else if (req.body.audio_base64) {
            // Handle base64 audio
            const buffer = Buffer.from(req.body.audio_base64, 'base64');
            tempFilePath = path.join('/tmp', `${uuidv4()}.${format || 'wav'}`);
            await fs.writeFile(tempFilePath, buffer);
        } else {
            return res.status(400).json({
                error: 'audio file or audio_base64 required'
            });
        }

        // Convert to WAV
        wavPath = path.join('/tmp', `${uuidv4()}.wav`);
        await convertToWav(tempFilePath, wavPath);

        // Validate
        const validation = await validateAudio(wavPath, sentence.text_devanagari);

        // Store
        const filename = `recordings/${user_id.replace(/[^a-z0-9]/gi, '_')}_${sentence_id}_${uuidv4()}.wav`;
        const storedPath = await storage.save(wavPath, filename);
        const fileSize = await storage.getSize(storedPath);

        // Save to database
        const result = await queryOne(
            `INSERT INTO recordings (
                sentence_id, user_id, audio_filepath,
                file_size_bytes, duration_seconds, sample_rate, channels,
                validation_status, validation_errors, audio_metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id`,
            [
                sentence_id,
                user_id,
                storedPath,
                fileSize,
                validation.checks.duration,
                validation.checks.sample_rate,
                validation.checks.channels,
                validation.valid ? 'passed' : 'failed',
                JSON.stringify(validation.errors),
                JSON.stringify(validation.metadata),
            ]
        );

        // Cleanup
        await fs.unlink(tempFilePath);
        await fs.unlink(wavPath);

        res.json({
            recording_id: result.id,
            status: validation.valid ? 'success' : 'warning',
            audio_duration: validation.checks.duration,
            validation: {
                valid: validation.valid,
                errors: validation.errors,
            },
        });

    } catch (error) {
        // Cleanup on error
        try {
            if (tempFilePath) await fs.unlink(tempFilePath);
            if (wavPath) await fs.unlink(wavPath);
        } catch {}
        
        next(error);
    }
});

module.exports = router;
