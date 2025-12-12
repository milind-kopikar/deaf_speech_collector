/**
 * Story API routes
 * GET /api/stories - List all stories
 * GET /api/stories/:id - Get specific story with sentences
 */

const express = require('express');
const router = express.Router();
const { queryAll, queryOne } = require('../db');
const { validateStoryId } = require('../middleware/validator');

// GET /api/stories - List all stories with stats
// If userId query parameter is provided, returns user-specific progress
router.get('/', async (req, res, next) => {
    try {
        const { userId } = req.query;
        
        let stories;
        
        if (userId) {
            // User-specific progress
            const normalizedUserId = userId.toLowerCase().trim();
            
            stories = await queryAll(`
                SELECT
                    s.id,
                    s.title,
                    s.language,
                    s.total_sentences,
                    s.created_at,
                    COUNT(DISTINCT r.id) FILTER (WHERE r.user_id = $1) as user_recordings,
                    COUNT(DISTINCT r.sentence_id) FILTER (WHERE r.user_id = $1) as user_sentences_recorded,
                    ROUND(
                        100.0 * COUNT(DISTINCT r.sentence_id) FILTER (WHERE r.user_id = $1) / NULLIF(s.total_sentences, 0),
                        1
                    ) as user_completion_pct,
                    COUNT(DISTINCT r.id) as total_recordings,
                    COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'approved') as approved_recordings,
                    COUNT(DISTINCT r.sentence_id) as sentences_with_recordings,
                    ROUND(
                        100.0 * COUNT(DISTINCT r.sentence_id) / NULLIF(s.total_sentences, 0),
                        1
                    ) as completion_pct
                FROM stories s
                LEFT JOIN sentences se ON se.story_id = s.id
                LEFT JOIN recordings r ON r.sentence_id = se.id
                GROUP BY s.id
                ORDER BY s.id ASC
            `, [normalizedUserId]);
        } else {
            // Global stats (all users)
            stories = await queryAll(`
                SELECT
                    s.id,
                    s.title,
                    s.language,
                    s.total_sentences,
                    s.created_at,
                    COUNT(DISTINCT r.id) as total_recordings,
                    COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'approved') as approved_recordings,
                    COUNT(DISTINCT r.sentence_id) as sentences_with_recordings,
                    ROUND(
                        100.0 * COUNT(DISTINCT r.sentence_id) / NULLIF(s.total_sentences, 0),
                        1
                    ) as completion_pct
                FROM stories s
                LEFT JOIN sentences se ON se.story_id = s.id
                LEFT JOIN recordings r ON r.sentence_id = se.id
                GROUP BY s.id
                ORDER BY s.id ASC
            `);
        }

        // Normalize numeric fields to JavaScript numbers to ease frontend parsing
        const normalized = stories.map(s => ({
            ...s,
            total_sentences: Number(s.total_sentences || 0),
            total_recordings: Number(s.total_recordings || 0),
            approved_recordings: Number(s.approved_recordings || 0),
            sentences_with_recordings: Number(s.sentences_with_recordings || 0),
            completion_pct: Number(s.completion_pct || 0),
            // User-specific fields (if userId was provided)
            user_recordings: s.user_recordings !== undefined ? Number(s.user_recordings || 0) : undefined,
            user_sentences_recorded: s.user_sentences_recorded !== undefined ? Number(s.user_sentences_recorded || 0) : undefined,
            user_completion_pct: s.user_completion_pct !== undefined ? Number(s.user_completion_pct || 0) : undefined,
        }));
        res.json({ stories: normalized });
    } catch (error) {
        next(error);
    }
});

// GET /api/stories/:id - Get story details with all sentences
router.get('/:id', validateStoryId, async (req, res, next) => {
    try {
        const story = await queryOne(
            'SELECT * FROM stories WHERE id = $1',
            [req.storyId]
        );

        if (!story) {
            return res.status(404).json({ error: 'Story not found' });
        }

        const sentences = await queryAll(
            `SELECT
                id,
                order_in_story,
                text_devanagari,
                text_iast,
                char_count,
                (SELECT COUNT(*) FROM recordings WHERE sentence_id = sentences.id) as recording_count
            FROM sentences
            WHERE story_id = $1
            ORDER BY order_in_story ASC`,
            [req.storyId]
        );

        // Normalize types
        const normalizedStory = { ...story, total_sentences: Number(story.total_sentences || 0) };
        const normalizedSentences = sentences.map(s => ({
            ...s,
            id: Number(s.id),
            order_in_story: Number(s.order_in_story || 0),
            char_count: Number(s.char_count || 0),
            recording_count: Number(s.recording_count || 0),
        }));
        res.json({ story: normalizedStory, sentences: normalizedSentences });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
