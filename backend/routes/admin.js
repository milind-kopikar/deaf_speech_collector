/**
 * Admin routes - protected endpoints for maintenance tasks
 */

const express = require('express');
const router = express.Router();
const { query } = require('../db');
const storage = require('../storage');

// Simple token-based authentication middleware
function requireAdminToken(req, res, next) {
    const token = req.query.token || req.headers['x-admin-token'];
    const adminToken = process.env.ADMIN_TOKEN || 'change-me-in-production';
    
    if (token !== adminToken) {
        return res.status(403).json({ error: 'Invalid or missing admin token' });
    }
    next();
}

/**
 * POST /api/admin/cleanup-deleted
 * Permanently delete recordings marked as 'deleted'
 * Requires: ?token=<ADMIN_TOKEN> or header X-Admin-Token
 * 
 * Example:
 * POST https://your-app.railway.app/api/admin/cleanup-deleted?token=your-secret-token
 */
router.post('/cleanup-deleted', requireAdminToken, async (req, res) => {
    try {
        console.log('🗑️  Admin cleanup initiated...');
        
        // Get all recordings marked as 'deleted'
        const result = await query(
            `SELECT id, audio_filepath, sentence_id, user_id, created_at 
             FROM recordings 
             WHERE status = $1 
             ORDER BY created_at`,
            ['deleted']
        );
        
        const deletedRecordings = result.rows;
        
        if (deletedRecordings.length === 0) {
            return res.json({
                success: true,
                message: 'No recordings marked for deletion',
                deleted_count: 0
            });
        }
        
        console.log(`📊 Found ${deletedRecordings.length} recording(s) marked for deletion`);
        
        const results = {
            total: deletedRecordings.length,
            deleted: 0,
            failed: 0,
            errors: []
        };
        
        for (const recording of deletedRecordings) {
            try {
                console.log(`   Processing ID ${recording.id}: ${recording.audio_filepath}`);
                
                // Delete from storage (R2/S3)
                try {
                    await storage.deleteFile(recording.audio_filepath);
                    console.log(`      ✓ Deleted from storage: ${recording.audio_filepath}`);
                } catch (storageErr) {
                    console.warn(`      ⚠️  Storage delete failed (may not exist): ${storageErr.message}`);
                    // Continue even if storage delete fails
                }
                
                // Delete from database
                await query('DELETE FROM recordings WHERE id = $1', [recording.id]);
                console.log(`      ✓ Deleted from database: ID ${recording.id}`);
                
                results.deleted++;
                
            } catch (err) {
                console.error(`      ❌ Failed to delete recording ${recording.id}:`, err.message);
                results.failed++;
                results.errors.push({
                    recording_id: recording.id,
                    filename: recording.filename,
                    error: err.message
                });
            }
        }
        
        console.log(`✨ Cleanup complete: ${results.deleted} deleted, ${results.failed} failed`);
        
        res.json({
            success: true,
            message: `Cleanup complete: ${results.deleted} deleted, ${results.failed} failed`,
            ...results
        });
        
    } catch (error) {
        console.error('❌ Cleanup error:', error);
        res.status(500).json({
            success: false,
            error: 'Cleanup failed',
            message: error.message
        });
    }
});

/**
 * GET /api/admin/stats
 * Get recording statistics by status
 * Requires admin token
 */
router.get('/stats', requireAdminToken, async (req, res) => {
    try {
        console.log('📊 Fetching recording stats...');
        
        const result = await query(`
            SELECT 
                status,
                COUNT(*) as count
            FROM recordings
            GROUP BY status
        `);
        
        console.log('✅ Stats query result:', result.rows);
        
        const stats = {
            by_status: result.rows || [],
            total: result.rows ? result.rows.reduce((sum, row) => sum + parseInt(row.count), 0) : 0
        };
        
        res.json(stats);
    } catch (error) {
        console.error('❌ Stats error:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ 
            error: 'Failed to fetch stats',
            message: error.message,
            detail: error.detail || 'No additional details'
        });
    }
});

module.exports = router;
