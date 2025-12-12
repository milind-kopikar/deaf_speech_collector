/**
 * Test API endpoints
 * For database verification and testing
 * Disable in production via ENABLE_TEST_ENDPOINTS=false
 */

const express = require('express');
const router = express.Router();
const { queryOne, queryAll } = require('../db');
const storage = require('../storage');
const { validateAudio } = require('../utils/audioValidator');
const { validateRecordingId } = require('../middleware/validator');

/**
 * GET /api/test/health
 * System health check
 */
router.get('/health', async (req, res, next) => {
    try {
        // Test database connection
        await queryOne('SELECT 1');

        // Get stats
        const stats = await queryOne(`
            SELECT
                (SELECT COUNT(*) FROM stories) as total_stories,
                (SELECT COUNT(*) FROM sentences) as total_sentences,
                (SELECT COUNT(*) FROM recordings) as total_recordings,
                (SELECT COUNT(*) FROM recordings WHERE status = 'pending') as pending_recordings,
                (SELECT COUNT(*) FROM recordings WHERE status = 'approved') as approved_recordings,
                (SELECT COUNT(*) FROM recordings WHERE status = 'rejected') as rejected_recordings
        `);

        res.json({
            status: 'healthy',
            database: 'connected',
            storage: process.env.STORAGE_TYPE || 'local',
            timestamp: new Date().toISOString(),
            ...stats,
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/test/sample?status=approved
 * Get random sentence-audio pair for testing
 */
router.get('/sample', async (req, res, next) => {
    try {
        const { status } = req.query;

        const whereClause = status ? 'AND r.status = $1' : '';
        const params = status ? [status] : [];

        const sample = await queryOne(`
            SELECT
                s.id as sentence_id,
                s.text_devanagari,
                s.text_iast,
                st.title as story_title,
                r.id as recording_id,
                r.audio_filepath,
                r.duration_seconds,
                r.sample_rate,
                r.file_size_bytes,
                r.validation_status,
                r.created_at
            FROM recordings r
            JOIN sentences s ON s.id = r.sentence_id
            JOIN stories st ON st.id = s.story_id
            WHERE r.validation_status = 'passed' ${whereClause}
            ORDER BY RANDOM()
            LIMIT 1
        `, params);

        if (!sample) {
            return res.status(404).json({
                error: 'No recordings found',
                hint: 'Upload some recordings first',
            });
        }

        res.json({
            sentence: {
                id: sample.sentence_id,
                text_devanagari: sample.text_devanagari,
                text_iast: sample.text_iast,
                story_title: sample.story_title,
            },
            recording: {
                id: sample.recording_id,
                audio_url: `/api/test/audio/${sample.recording_id}`,
                duration: sample.duration_seconds,
                sample_rate: sample.sample_rate,
                file_size: sample.file_size_bytes,
                created_at: sample.created_at,
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/test/audio/:recordingId
 * Download audio file
 */
router.get('/audio/:recordingId', validateRecordingId, async (req, res, next) => {
    try {
        const recording = await queryOne(
            'SELECT audio_filepath FROM recordings WHERE id = $1',
            [req.recordingId]
        );

        if (!recording) {
            return res.status(404).json({ error: 'Recording not found' });
        }

        // Stream file from storage
        const stream = await storage.getStream(recording.audio_filepath);
        
        res.setHeader('Content-Type', 'audio/wav');
        res.setHeader('Content-Disposition', `attachment; filename="recording_${req.recordingId}.wav"`);
        
        stream.pipe(res);

    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/test/validate/:recordingId
 * Validate specific recording
 */
router.get('/validate/:recordingId', validateRecordingId, async (req, res, next) => {
    try {
        const recording = await queryOne(`
            SELECT r.*, s.text_devanagari
            FROM recordings r
            JOIN sentences s ON s.id = r.sentence_id
            WHERE r.id = $1
        `, [req.recordingId]);

        if (!recording) {
            return res.status(404).json({ error: 'Recording not found' });
        }

        // Get file from storage to temp location
        const tempPath = `/tmp/validate_${req.recordingId}.wav`;
        const buffer = await storage.get(recording.audio_filepath);
        const fs = require('fs').promises;
        await fs.writeFile(tempPath, buffer);

        // Validate
        const validation = await validateAudio(tempPath, recording.text_devanagari);

        // Cleanup
        await fs.unlink(tempPath);

        res.json({
            recording_id: req.recordingId,
            ...validation,
        });

    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/test/recordings?limit=10&status=pending
 * List recordings with filters
 */
router.get('/recordings', async (req, res, next) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const { status, validation_status } = req.query;

        let whereConditions = [];
        let params = [];
        let paramCount = 1;

        if (status) {
            whereConditions.push(`r.status = $${paramCount++}`);
            params.push(status);
        }

        if (validation_status) {
            whereConditions.push(`r.validation_status = $${paramCount++}`);
            params.push(validation_status);
        }

        const whereClause = whereConditions.length > 0
            ? 'WHERE ' + whereConditions.join(' AND ')
            : '';

        params.push(limit);

        const recordings = await queryAll(`
            SELECT
                r.id,
                r.user_id,
                r.duration_seconds,
                r.status,
                r.validation_status,
                r.created_at,
                s.text_devanagari,
                st.title as story_title
            FROM recordings r
            JOIN sentences s ON s.id = r.sentence_id
            JOIN stories st ON st.id = s.story_id
            ${whereClause}
            ORDER BY r.created_at DESC
            LIMIT $${paramCount}
        `, params);

        res.json({ recordings, count: recordings.length });

    } catch (error) {
        next(error);
    }
});

module.exports = router;
