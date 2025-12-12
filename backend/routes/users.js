/**
 * User Progress API routes
 * GET /api/users/:email/progress - Get user's recording progress and stats
 */

const express = require('express');
const router = express.Router();
const { query, queryOne } = require('../db');

// GET /api/users/:email/progress
// Returns user's overall progress and statistics
router.get('/:email/progress', async (req, res, next) => {
    try {
        const email = req.params.email.toLowerCase().trim();

        if (!email || !email.includes('@')) {
            return res.status(400).json({ error: 'Valid email required' });
        }

        // Get user's recording statistics
        const stats = await queryOne(`
            SELECT
                COUNT(DISTINCT r.id) as total_recordings,
                COUNT(DISTINCT r.sentence_id) as unique_sentences,
                COUNT(DISTINCT s.story_id) as stories_started,
                COALESCE(SUM(CASE 
                    WHEN story_progress.completed = true THEN 1 
                    ELSE 0 
                END), 0) as stories_completed,
                MAX(r.created_at) as last_activity
            FROM recordings r
            JOIN sentences s ON s.id = r.sentence_id
            LEFT JOIN (
                SELECT 
                    s2.story_id,
                    r2.user_id,
                    CASE 
                        WHEN COUNT(DISTINCT r2.sentence_id) >= (
                            SELECT COUNT(*) 
                            FROM sentences 
                            WHERE story_id = s2.story_id
                        ) THEN true 
                        ELSE false 
                    END as completed
                FROM recordings r2
                JOIN sentences s2 ON s2.id = r2.sentence_id
                WHERE r2.user_id = $1
                GROUP BY s2.story_id, r2.user_id
            ) story_progress ON story_progress.story_id = s.story_id 
                AND story_progress.user_id = r.user_id
            WHERE r.user_id = $1
        `, [email]);

        if (!stats || stats.total_recordings === '0') {
            // New user, no recordings yet
            return res.json({
                email: email,
                total_recordings: 0,
                unique_sentences: 0,
                stories_started: 0,
                stories_completed: 0,
                last_activity: null,
                is_new_user: true
            });
        }

        // Get per-story progress
        const storyProgress = await query(`
            SELECT
                st.id as story_id,
                st.title as story_title,
                st.total_sentences,
                COUNT(DISTINCT r.sentence_id) as sentences_recorded,
                ROUND(
                    100.0 * COUNT(DISTINCT r.sentence_id) / NULLIF(st.total_sentences, 0),
                    1
                ) as completion_pct,
                MAX(r.created_at) as last_recorded_at
            FROM stories st
            JOIN sentences s ON s.story_id = st.id
            JOIN recordings r ON r.sentence_id = s.id
            WHERE r.user_id = $1
            GROUP BY st.id, st.title, st.total_sentences
            ORDER BY last_recorded_at DESC
        `, [email]);

        res.json({
            email: email,
            total_recordings: Number(stats.total_recordings || 0),
            unique_sentences: Number(stats.unique_sentences || 0),
            stories_started: Number(stats.stories_started || 0),
            stories_completed: Number(stats.stories_completed || 0),
            last_activity: stats.last_activity,
            is_new_user: false,
            story_progress: storyProgress || []
        });

    } catch (error) {
        next(error);
    }
});

module.exports = router;
