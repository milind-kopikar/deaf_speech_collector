/**
 * ASR live-demo route handler factories.
 *
 * Each variant's collector (konkani_collector for amchi, deaf_speech_collector
 * for deaf) mounts these handlers under `/api/asr-demo/*`. The only
 * variant-specific input is the table prefix (`amchi_demo` or `deaf_demo`)
 * and the R2 uploader (which is bound to a variant-specific bucket).
 *
 * Database access is via the collector's `db.js` helpers (query/queryOne/queryAll).
 *
 * All handlers assume `express.json()` middleware has parsed the body, and
 * that `requireCollectorAuth` has been run upstream so we don't repeat
 * auth checks here.
 *
 * Factory pattern lets us ship the SAME implementation file into both
 * collector repos and parameterise the variant at boot.
 */

/**
 * @param {Object} deps
 * @param {string} deps.tablePrefix      - 'amchi_demo' or 'deaf_demo'
 * @param {Object} deps.db               - { query, queryOne } from db.js
 * @param {Object|null} deps.r2          - R2 uploader from asr_demo_r2.js, or null to skip
 * @returns {{
 *   feedbackInit: import('express').RequestHandler,
 *   feedbackUpdate: import('express').RequestHandler,
 *   event: import('express').RequestHandler,
 *   survey: import('express').RequestHandler,
 * }}
 */
function makeHandlers({ tablePrefix, db, r2 }) {
    if (!tablePrefix || typeof tablePrefix !== 'string') {
        throw new Error('makeHandlers: tablePrefix is required');
    }
    if (!db || typeof db.query !== 'function') {
        throw new Error('makeHandlers: db with .query() is required');
    }

    const tableFeedback = `${tablePrefix}_feedback`;
    const tableEvents   = `${tablePrefix}_events`;
    const tableSurvey   = `${tablePrefix.replace('_demo', '_user')}_survey`;
    // tablePrefix='amchi_demo' → tableSurvey='amchi_user_survey'
    // tablePrefix='deaf_demo'  → tableSurvey='deaf_user_survey'

    // ──────────────────────────────────────────────────────────────────────
    // POST /feedback/init
    //   Body: { audio_base64, raw, corrected, mode, latency_ms,
    //           session_id, user_agent? }
    //   201:  { id, audio_url }
    // ──────────────────────────────────────────────────────────────────────
    async function feedbackInit(req, res, next) {
        try {
            const {
                audio_base64,
                raw,
                corrected,
                mode,
                latency_ms,
                session_id,
                user_agent,
            } = req.body || {};

            // Validate required fields.
            const errors = [];
            if (typeof audio_base64 !== 'string' || audio_base64.length === 0) {
                errors.push('audio_base64 (non-empty string) is required');
            }
            if (typeof raw !== 'string') errors.push('raw (string) is required');
            if (typeof corrected !== 'string') errors.push('corrected (string) is required');
            if (typeof session_id !== 'string' || session_id.length === 0) {
                errors.push('session_id (non-empty string) is required');
            }
            if (errors.length > 0) {
                return res.status(400).json({ error: errors.join('; ') });
            }

            const audio_bytes = Buffer.from(audio_base64, 'base64').length;

            // Latency may be missing or partial.
            const latency_asr_ms = latency_ms && typeof latency_ms.asr === 'number'
                ? latency_ms.asr : null;
            const latency_pp_ms = latency_ms && typeof latency_ms.postprocess === 'number'
                ? latency_ms.postprocess : null;

            // 1. INSERT row first — we need the UUID for the R2 key, and we
            //    want the row to exist even if R2 upload fails.
            const insertSql = `
                INSERT INTO ${tableFeedback}
                    (raw_text, corrected_text, postprocess_mode,
                     latency_asr_ms, latency_pp_ms,
                     audio_bytes, user_agent, session_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING id
            `;
            const row = await db.queryOne(insertSql, [
                raw,
                corrected,
                mode || null,
                latency_asr_ms,
                latency_pp_ms,
                audio_bytes,
                user_agent || null,
                session_id,
            ]);
            const id = row.id;

            // 2. Upload to R2 with the row's UUID as the key. Best-effort:
            //    if r2 is unconfigured or the upload fails, we leave
            //    audio_url = NULL on the row and still return 201.
            let audio_url = null;
            if (r2 && typeof r2.uploadWav === 'function') {
                try {
                    audio_url = await r2.uploadWav(id, audio_base64);
                } catch (err) {
                    console.warn(`[asr_demo] uploadWav threw for ${id}: ${err.message}`);
                    audio_url = null;
                }
            }

            if (audio_url) {
                await db.query(
                    `UPDATE ${tableFeedback} SET audio_url = $1 WHERE id = $2`,
                    [audio_url, id]
                );
            }

            return res.status(201).json({ id, audio_url });
        } catch (err) {
            next(err);
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    // POST /feedback/update
    //   Body: { id, edited_raw?, edited_corrected?, thumb_raw?,
    //           thumb_corrected?, tts_choice?, tts_language? }
    //   200:  { ok: true }
    //   404:  { error: 'not found' }
    // ──────────────────────────────────────────────────────────────────────
    async function feedbackUpdate(req, res, next) {
        try {
            const body = req.body || {};
            if (typeof body.id !== 'string' || body.id.length === 0) {
                return res.status(400).json({ error: 'id (string) is required' });
            }

            // Whitelist updatable fields and validate enums.
            const ALLOWED = ['edited_raw', 'edited_corrected', 'thumb_raw',
                             'thumb_corrected', 'tts_choice', 'tts_language'];
            const ENUMS = {
                thumb_raw:       new Set(['up', 'down']),
                thumb_corrected: new Set(['up', 'down']),
                tts_choice:      new Set(['raw', 'corrected']),
            };

            const setClauses = [];
            const values = [];
            let idx = 1;
            for (const key of ALLOWED) {
                if (key in body) {
                    const v = body[key];
                    // null is allowed → clears the field
                    if (v !== null) {
                        if (typeof v !== 'string') {
                            return res.status(400).json({ error: `${key} must be a string or null` });
                        }
                        if (ENUMS[key] && !ENUMS[key].has(v)) {
                            return res.status(400).json({
                                error: `${key} must be one of: ${[...ENUMS[key]].join(', ')}`
                            });
                        }
                    }
                    setClauses.push(`${key} = $${idx++}`);
                    values.push(v);
                }
            }

            if (setClauses.length === 0) {
                return res.status(400).json({ error: 'no updatable fields provided' });
            }

            values.push(body.id);
            const sql = `UPDATE ${tableFeedback} SET ${setClauses.join(', ')} WHERE id = $${idx}`;
            const result = await db.query(sql, values);

            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'not found' });
            }
            return res.status(200).json({ ok: true });
        } catch (err) {
            next(err);
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    // POST /events
    //   Body: { session_id, feedback_id?, event_type, event_target?, event_value?, user_agent? }
    //   202:  { ok: true }     (fire-and-forget)
    // ──────────────────────────────────────────────────────────────────────
    const ALLOWED_EVENT_TYPES = new Set([
        'record_click',
        'transcribe_click',
        'thumb_click',
        'tts_click',
        'edit_blur',
        'survey_link_click',
        'survey_submit',
    ]);

    async function event(req, res, next) {
        try {
            const b = req.body || {};
            if (typeof b.session_id !== 'string' || b.session_id.length === 0) {
                return res.status(400).json({ error: 'session_id is required' });
            }
            if (typeof b.event_type !== 'string' || !ALLOWED_EVENT_TYPES.has(b.event_type)) {
                return res.status(400).json({
                    error: `event_type must be one of: ${[...ALLOWED_EVENT_TYPES].join(', ')}`
                });
            }
            await db.query(
                `INSERT INTO ${tableEvents}
                    (session_id, feedback_id, event_type, event_target, event_value, user_agent)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    b.session_id,
                    b.feedback_id || null,
                    b.event_type,
                    typeof b.event_target === 'string' ? b.event_target : null,
                    typeof b.event_value === 'string' ? b.event_value : null,
                    typeof b.user_agent === 'string' ? b.user_agent : null,
                ]
            );
            return res.status(202).json({ ok: true });
        } catch (err) {
            next(err);
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    // POST /survey
    //   Body: { session_id, q1_clarity, q2_likelihood, comments?, user_agent? }
    //   201:  { ok: true }
    // ──────────────────────────────────────────────────────────────────────
    async function survey(req, res, next) {
        try {
            const b = req.body || {};
            if (typeof b.session_id !== 'string' || b.session_id.length === 0) {
                return res.status(400).json({ error: 'session_id is required' });
            }
            if (!Number.isInteger(b.q1_clarity) || b.q1_clarity < 1 || b.q1_clarity > 5) {
                return res.status(400).json({ error: 'q1_clarity must be an integer in 1..5' });
            }
            if (!Number.isInteger(b.q2_likelihood) || b.q2_likelihood < 1 || b.q2_likelihood > 5) {
                return res.status(400).json({ error: 'q2_likelihood must be an integer in 1..5' });
            }
            if ('comments' in b && b.comments !== null && typeof b.comments !== 'string') {
                return res.status(400).json({ error: 'comments must be a string or null' });
            }

            const row = await db.queryOne(
                `INSERT INTO ${tableSurvey}
                    (session_id, q1_clarity, q2_likelihood, comments, user_agent)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING id`,
                [
                    b.session_id,
                    b.q1_clarity,
                    b.q2_likelihood,
                    b.comments || null,
                    typeof b.user_agent === 'string' ? b.user_agent : null,
                ]
            );
            return res.status(201).json({ ok: true, id: row.id });
        } catch (err) {
            next(err);
        }
    }

    return { feedbackInit, feedbackUpdate, event, survey };
}

module.exports = { makeHandlers };
