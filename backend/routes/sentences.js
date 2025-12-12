/**
 * Sentence API routes
 * GET /api/sentences/:storyId/next - Get next sentence for user to record
 */

const express = require('express');
const router = express.Router();
const { queryOne } = require('../db');

// GET /api/sentences/:storyId/next?userId=xyz
// Returns next unrecorded sentence for this user in this story
router.get('/:storyId/next', async (req, res, next) => {
    try {
        const { storyId } = req.params;
        let { userId } = req.query;

        if (!userId) {
            return res.status(400).json({ error: 'userId query parameter required' });
        }

        // Normalize userId to lowercase for consistency
        userId = userId.toLowerCase().trim();

        // Get next sentence this user hasn't recorded yet
        const sentence = await queryOne(`
            SELECT
                s.id,
                s.order_in_story,
                s.text_devanagari,
                s.text_iast,
                st.title as story_title,
                st.total_sentences,
                (
                    SELECT COUNT(*) 
                    FROM sentences se2
                    WHERE se2.story_id = s.story_id
                    AND se2.order_in_story < s.order_in_story
                    AND NOT EXISTS (
                        SELECT 1 FROM recordings r
                        WHERE r.sentence_id = se2.id
                        AND r.user_id = $2
                    )
                ) as remaining_before,
                (
                    SELECT COUNT(*)
                    FROM sentences se2
                    WHERE se2.story_id = s.story_id
                    AND NOT EXISTS (
                        SELECT 1 FROM recordings r
                        WHERE r.sentence_id = se2.id
                        AND r.user_id = $2
                    )
                ) as total_remaining
            FROM sentences s
            JOIN stories st ON st.id = s.story_id
            WHERE s.story_id = $1
            AND NOT EXISTS (
                SELECT 1 FROM recordings r
                WHERE r.sentence_id = s.id
                AND r.user_id = $2
            )
            ORDER BY s.order_in_story ASC
            LIMIT 1
        `, [storyId, userId]);

        if (!sentence) {
            return res.json({
                completed: true,
                message: 'All sentences in this story have been recorded by this user',
            });
        }

        // Convert numeric values to numbers for consistent client-side handling
        res.json({
            sentence_id: Number(sentence.id),
            text_devanagari: sentence.text_devanagari,
            text_iast: sentence.text_iast,
            story_title: sentence.story_title,
            order: Number(sentence.order_in_story || 0),
            total: Number(sentence.total_sentences || 0),
            remaining: Number(sentence.total_remaining || 0),
            remaining_before: Number(sentence.remaining_before || 0),
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/sentences/:storyId/all?userId=xyz
// Returns all sentences for a story with recording status for this user
router.get('/:storyId/all', async (req, res, next) => {
    try {
        const { storyId } = req.params;
        let { userId } = req.query;

        if (!userId) {
            return res.status(400).json({ error: 'userId query parameter required' });
        }

        userId = userId.toLowerCase().trim();

        const { query } = require('../db');
        const result = await query(`
            SELECT
                s.id,
                s.order_in_story,
                s.text_devanagari,
                s.text_iast,
                CASE WHEN r.id IS NOT NULL THEN true ELSE false END as has_recording,
                r.id as recording_id
            FROM sentences s
            LEFT JOIN recordings r ON r.sentence_id = s.id AND r.user_id = $2
            WHERE s.story_id = $1
            ORDER BY s.order_in_story ASC
        `, [storyId, userId]);

        res.json(result.rows);
    } catch (error) {
        next(error);
    }
});

module.exports = router;
