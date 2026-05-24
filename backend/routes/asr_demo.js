/**
 * Express router for the Deaf Speech ASR live-demo telemetry endpoints.
 *
 * Mounted at `/api/asr-demo` by backend/server.js. The shape is:
 *
 *   POST /api/asr-demo/feedback/init
 *   POST /api/asr-demo/feedback/update
 *   POST /api/asr-demo/events
 *   POST /api/asr-demo/survey
 *
 * All routes are gated by `requireCollectorAuth` (Bearer-token check
 * against `COLLECTOR_API_KEY`).
 *
 * This file binds the variant-specific table prefix ('deaf_demo') and
 * R2 bucket (via the env-driven r2 uploader). The shape of this file is
 * identical to konkani_collector/backend/routes/asr_demo.js apart from
 * TABLE_PREFIX.
 */

const express = require('express');
const router = express.Router();

const db = require('../db');
const { makeHandlers } = require('../lib/asr_demo_handlers');
const { fromEnv: r2FromEnv } = require('../lib/asr_demo_r2');
const { requireCollectorAuth } = require('../middleware/collectorAuth');

const TABLE_PREFIX = 'deaf_demo';

// Build the R2 uploader from environment. Returns null if env vars are
// not set (in which case audio uploads are skipped and rows are still
// inserted with audio_url = NULL).
const r2 = r2FromEnv();

const handlers = makeHandlers({ tablePrefix: TABLE_PREFIX, db, r2 });

// Every route requires auth.
router.use(requireCollectorAuth);

router.post('/feedback/init',   handlers.feedbackInit);
router.post('/feedback/update', handlers.feedbackUpdate);
router.post('/events',          handlers.event);
router.post('/survey',          handlers.survey);

module.exports = router;
