/**
 * Tests for the ASR live-demo telemetry feature.
 *
 * Covers three layers:
 *   1. `makeR2Uploader` — pure config/validation around the S3 client.
 *   2. `requireCollectorAuth` middleware — Bearer-token check.
 *   3. `makeHandlers` factory — feedback-init / feedback-update / event /
 *      survey handlers. Run with a mocked db + mocked r2 so no real
 *      Postgres or network calls happen.
 *
 * Variant tested: amchi (tablePrefix='amchi_demo'). The deaf collector
 * has its own copy of this test file; the two are kept in sync.
 */

const { makeR2Uploader } = require('../lib/asr_demo_r2');
const { makeHandlers } = require('../lib/asr_demo_handlers');
const { requireCollectorAuth, constantTimeEqual } = require('../middleware/collectorAuth');

// ---------------------------------------------------------------------------
// Helpers — synchronous req/res mocks (no Express overhead)
// ---------------------------------------------------------------------------

function mockRes() {
    const res = {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
    };
    return res;
}

function mockNext() {
    // Make handler-thrown errors visible in test output. The handlers'
    // outer try/catch calls `next(err)` to defer to Express's error
    // middleware in prod; in tests, swallowing the error silently makes
    // the wrong-statusCode assertion confusing. Re-throw so jest reports
    // the real cause.
    const fn = jest.fn((err) => {
        if (err) throw err;
    });
    return fn;
}

function mockDb({ insertId = 'fixed-uuid', rowCount = 1 } = {}) {
    const db = {
        query: jest.fn(async (sql) => {
            // Match with optional leading whitespace — the handlers use
            // template literals which add a leading newline + indentation.
            if (/^\s*UPDATE/i.test(sql)) return { rowCount };
            if (/^\s*INSERT/i.test(sql)) return { rowCount: 1, rows: [{ id: insertId }] };
            return { rowCount: 0, rows: [] };
        }),
        queryOne: jest.fn(async (sql) => {
            if (/^\s*INSERT/i.test(sql)) return { id: insertId };
            return null;
        }),
    };
    return db;
}

function mockR2({ url = 'https://bucket.acct.r2.cloudflarestorage.com/fixed-uuid.wav' } = {}) {
    return {
        bucket: 'amchi-asr-demo-feedback',
        uploadWav: jest.fn(async (id) => url ? url.replace('fixed-uuid', id) : null),
    };
}

const BASE_INIT_BODY = {
    audio_base64: Buffer.from('fake-wav-bytes').toString('base64'),
    raw: 'दूध किती',
    corrected: 'दूध किती आहे?',
    mode: 'FILL',
    latency_ms: { asr: 200, postprocess: 1500 },
    session_id: 'session-xyz',
    user_agent: 'jest/1.0',
};

// ---------------------------------------------------------------------------
// makeR2Uploader
// ---------------------------------------------------------------------------

describe('makeR2Uploader', () => {
    test('throws without bucket', () => {
        expect(() => makeR2Uploader({})).toThrow(/bucket/);
    });

    test('throws when credentials missing and no s3Client given', () => {
        expect(() => makeR2Uploader({ bucket: 'b' })).toThrow(/accessKeyId/);
    });

    test('uploadWav decodes base64, calls s3, returns canonical URL', async () => {
        const send = jest.fn(async () => ({}));
        const fakeClient = { send };
        const u = makeR2Uploader({
            bucket: 'b',
            accountId: 'acct',
            accessKeyId: 'k',
            secretAccessKey: 's',
            s3Client: fakeClient,
        });
        const id = 'row-123';
        const audio = Buffer.from('hello').toString('base64');
        const url = await u.uploadWav(id, audio);
        expect(url).toBe('https://b.acct.r2.cloudflarestorage.com/row-123.wav');
        expect(send).toHaveBeenCalledTimes(1);
        const cmd = send.mock.calls[0][0];
        expect(cmd.input.Bucket).toBe('b');
        expect(cmd.input.Key).toBe('row-123.wav');
        expect(cmd.input.Body).toBeInstanceOf(Buffer);
        expect(cmd.input.ContentType).toBe('audio/wav');
    });

    test('uploadWav rejects missing id', async () => {
        const u = makeR2Uploader({ bucket: 'b', s3Client: { send: jest.fn() } });
        await expect(u.uploadWav('', 'YQ==')).rejects.toThrow(/id/);
        await expect(u.uploadWav(null, 'YQ==')).rejects.toThrow(/id/);
    });

    test('uploadWav rejects missing audioBase64', async () => {
        const u = makeR2Uploader({ bucket: 'b', s3Client: { send: jest.fn() } });
        await expect(u.uploadWav('id', '')).rejects.toThrow(/audioBase64/);
    });

    test('uploadWav returns null when s3.send throws (does not throw)', async () => {
        const send = jest.fn(async () => { throw new Error('network down'); });
        const u = makeR2Uploader({ bucket: 'b', s3Client: { send } });
        const url = await u.uploadWav('id', Buffer.from('x').toString('base64'));
        expect(url).toBeNull();
    });

    test('uploadWav rejects when decoded audio is empty', async () => {
        const u = makeR2Uploader({ bucket: 'b', s3Client: { send: jest.fn() } });
        // base64 of empty buffer is empty string, already covered. But base64
        // of a string that decodes to zero bytes (e.g., padding-only) should
        // also be rejected.
        await expect(u.uploadWav('id', '====')).rejects.toThrow(/empty/);
    });
});

// ---------------------------------------------------------------------------
// requireCollectorAuth
// ---------------------------------------------------------------------------

describe('requireCollectorAuth', () => {
    const ORIGINAL_KEY = process.env.COLLECTOR_API_KEY;

    afterEach(() => {
        if (ORIGINAL_KEY === undefined) delete process.env.COLLECTOR_API_KEY;
        else process.env.COLLECTOR_API_KEY = ORIGINAL_KEY;
    });

    test('503 when env var not set', () => {
        delete process.env.COLLECTOR_API_KEY;
        const res = mockRes();
        const next = mockNext();
        requireCollectorAuth({ headers: { authorization: 'Bearer x' } }, res, next);
        expect(res.statusCode).toBe(503);
        expect(next).not.toHaveBeenCalled();
    });

    test('401 with no Authorization header', () => {
        process.env.COLLECTOR_API_KEY = 'secret';
        const res = mockRes();
        const next = mockNext();
        requireCollectorAuth({ headers: {} }, res, next);
        expect(res.statusCode).toBe(401);
        expect(next).not.toHaveBeenCalled();
    });

    test('401 with malformed header', () => {
        process.env.COLLECTOR_API_KEY = 'secret';
        const res = mockRes();
        const next = mockNext();
        requireCollectorAuth({ headers: { authorization: 'NotBearer x' } }, res, next);
        expect(res.statusCode).toBe(401);
    });

    test('401 with wrong token', () => {
        process.env.COLLECTOR_API_KEY = 'secret';
        const res = mockRes();
        const next = mockNext();
        requireCollectorAuth({ headers: { authorization: 'Bearer wrong' } }, res, next);
        expect(res.statusCode).toBe(401);
    });

    test('next() with correct token', () => {
        process.env.COLLECTOR_API_KEY = 'secret';
        const res = mockRes();
        const next = mockNext();
        requireCollectorAuth({ headers: { authorization: 'Bearer secret' } }, res, next);
        expect(next).toHaveBeenCalled();
    });

    test('constantTimeEqual returns false for mismatched lengths', () => {
        expect(constantTimeEqual('abc', 'abcd')).toBe(false);
    });
    test('constantTimeEqual returns true for equal', () => {
        expect(constantTimeEqual('secret', 'secret')).toBe(true);
    });
    test('constantTimeEqual returns false for non-strings', () => {
        expect(constantTimeEqual(null, 'x')).toBe(false);
        expect(constantTimeEqual('x', undefined)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// makeHandlers — argument validation
// ---------------------------------------------------------------------------

describe('makeHandlers — config validation', () => {
    test('throws without tablePrefix', () => {
        expect(() => makeHandlers({ db: mockDb() })).toThrow(/tablePrefix/);
    });
    test('throws without db', () => {
        expect(() => makeHandlers({ tablePrefix: 'amchi_demo' })).toThrow(/db/);
    });
    test('returns four handlers', () => {
        const h = makeHandlers({ tablePrefix: 'amchi_demo', db: mockDb(), r2: null });
        expect(typeof h.feedbackInit).toBe('function');
        expect(typeof h.feedbackUpdate).toBe('function');
        expect(typeof h.event).toBe('function');
        expect(typeof h.survey).toBe('function');
    });
});

// ---------------------------------------------------------------------------
// makeHandlers — feedbackInit
// ---------------------------------------------------------------------------

describe('feedbackInit', () => {
    let db, r2, handlers;
    beforeEach(() => {
        db = mockDb();
        r2 = mockR2();
        handlers = makeHandlers({ tablePrefix: 'amchi_demo', db, r2 });
    });

    test('happy path returns 201 with id + audio_url', async () => {
        const res = mockRes();
        await handlers.feedbackInit({ body: { ...BASE_INIT_BODY } }, res, mockNext());
        expect(res.statusCode).toBe(201);
        expect(res.body.id).toBe('fixed-uuid');
        expect(res.body.audio_url).toMatch(/fixed-uuid\.wav$/);

        // Verify INSERT into the right table
        const insertSql = db.queryOne.mock.calls.find(c => /^\s*INSERT INTO amchi_demo_feedback/i.test(c[0]));
        expect(insertSql).toBeTruthy();

        // Verify UPDATE wrote the audio_url back
        const updateSql = db.query.mock.calls.find(c => /UPDATE amchi_demo_feedback SET audio_url/i.test(c[0]));
        expect(updateSql).toBeTruthy();

        // Verify R2 was called with the id
        expect(r2.uploadWav).toHaveBeenCalledWith('fixed-uuid', BASE_INIT_BODY.audio_base64);
    });

    test('rejects missing audio_base64', async () => {
        const res = mockRes();
        const body = { ...BASE_INIT_BODY }; delete body.audio_base64;
        await handlers.feedbackInit({ body }, res, mockNext());
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/audio_base64/);
    });

    test('rejects missing session_id', async () => {
        const res = mockRes();
        const body = { ...BASE_INIT_BODY }; delete body.session_id;
        await handlers.feedbackInit({ body }, res, mockNext());
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/session_id/);
    });

    test('rejects missing raw/corrected', async () => {
        const res = mockRes();
        const body = { ...BASE_INIT_BODY }; delete body.raw;
        await handlers.feedbackInit({ body }, res, mockNext());
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/raw/);
    });

    test('row still created with audio_url=null when R2 not configured', async () => {
        handlers = makeHandlers({ tablePrefix: 'amchi_demo', db, r2: null });
        const res = mockRes();
        await handlers.feedbackInit({ body: { ...BASE_INIT_BODY } }, res, mockNext());
        expect(res.statusCode).toBe(201);
        expect(res.body.audio_url).toBeNull();
        // INSERT happened; UPDATE was NOT called (no audio_url to write back)
        const updateSql = db.query.mock.calls.find(c => /UPDATE amchi_demo_feedback SET audio_url/i.test(c[0]));
        expect(updateSql).toBeFalsy();
    });

    test('row still created when r2.uploadWav returns null', async () => {
        r2.uploadWav.mockResolvedValueOnce(null);
        const res = mockRes();
        await handlers.feedbackInit({ body: { ...BASE_INIT_BODY } }, res, mockNext());
        expect(res.statusCode).toBe(201);
        expect(res.body.audio_url).toBeNull();
    });

    test('row still created when r2.uploadWav throws', async () => {
        r2.uploadWav.mockRejectedValueOnce(new Error('boom'));
        const res = mockRes();
        await handlers.feedbackInit({ body: { ...BASE_INIT_BODY } }, res, mockNext());
        expect(res.statusCode).toBe(201);
        expect(res.body.audio_url).toBeNull();
    });

    test('latency fields tolerate missing latency_ms', async () => {
        const res = mockRes();
        const body = { ...BASE_INIT_BODY }; delete body.latency_ms;
        await handlers.feedbackInit({ body }, res, mockNext());
        expect(res.statusCode).toBe(201);
    });
});

// ---------------------------------------------------------------------------
// feedbackUpdate
// ---------------------------------------------------------------------------

describe('feedbackUpdate', () => {
    let db, handlers;
    beforeEach(() => {
        db = mockDb({ rowCount: 1 });
        handlers = makeHandlers({ tablePrefix: 'amchi_demo', db, r2: null });
    });

    test('updates thumb_raw=up', async () => {
        const res = mockRes();
        await handlers.feedbackUpdate({ body: { id: 'r1', thumb_raw: 'up' } }, res, mockNext());
        expect(res.statusCode).toBe(200);
        const sql = db.query.mock.calls[0][0];
        expect(sql).toMatch(/UPDATE amchi_demo_feedback/);
        expect(sql).toMatch(/thumb_raw = \$1/);
    });

    test('updates multiple fields together', async () => {
        const res = mockRes();
        await handlers.feedbackUpdate({
            body: { id: 'r1', thumb_corrected: 'down', tts_choice: 'raw', edited_corrected: 'fixed' }
        }, res, mockNext());
        expect(res.statusCode).toBe(200);
        const params = db.query.mock.calls[0][1];
        // last param is id; first three are the field values
        expect(params).toContain('down');
        expect(params).toContain('raw');
        expect(params).toContain('fixed');
        expect(params[params.length - 1]).toBe('r1');
    });

    test('null value clears a field', async () => {
        const res = mockRes();
        await handlers.feedbackUpdate({ body: { id: 'r1', thumb_raw: null } }, res, mockNext());
        expect(res.statusCode).toBe(200);
        const params = db.query.mock.calls[0][1];
        expect(params[0]).toBeNull();
    });

    test('rejects missing id', async () => {
        const res = mockRes();
        await handlers.feedbackUpdate({ body: { thumb_raw: 'up' } }, res, mockNext());
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/id/);
    });

    test('rejects no updatable fields', async () => {
        const res = mockRes();
        await handlers.feedbackUpdate({ body: { id: 'r1' } }, res, mockNext());
        expect(res.statusCode).toBe(400);
    });

    test('rejects invalid thumb_raw value', async () => {
        const res = mockRes();
        await handlers.feedbackUpdate({ body: { id: 'r1', thumb_raw: 'maybe' } }, res, mockNext());
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/thumb_raw/);
    });

    test('rejects invalid tts_choice value', async () => {
        const res = mockRes();
        await handlers.feedbackUpdate({ body: { id: 'r1', tts_choice: 'both' } }, res, mockNext());
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/tts_choice/);
    });

    test('returns 404 when id does not exist', async () => {
        db = mockDb({ rowCount: 0 });
        handlers = makeHandlers({ tablePrefix: 'amchi_demo', db, r2: null });
        const res = mockRes();
        await handlers.feedbackUpdate({ body: { id: 'nope', thumb_raw: 'up' } }, res, mockNext());
        expect(res.statusCode).toBe(404);
    });

    test('ignores unknown fields (whitelist)', async () => {
        const res = mockRes();
        await handlers.feedbackUpdate({
            body: { id: 'r1', thumb_raw: 'up', injected_sql: "'); DROP TABLE x; --" }
        }, res, mockNext());
        expect(res.statusCode).toBe(200);
        // SQL should not contain the injected key
        expect(db.query.mock.calls[0][0]).not.toMatch(/injected_sql/);
    });
});

// ---------------------------------------------------------------------------
// event
// ---------------------------------------------------------------------------

describe('event', () => {
    let db, handlers;
    beforeEach(() => {
        db = mockDb();
        handlers = makeHandlers({ tablePrefix: 'amchi_demo', db, r2: null });
    });

    const EVENT_TYPES = [
        'record_click', 'transcribe_click', 'thumb_click', 'tts_click',
        'edit_blur', 'survey_link_click', 'survey_submit',
    ];

    test.each(EVENT_TYPES)('accepts event_type=%s', async (event_type) => {
        const res = mockRes();
        await handlers.event({ body: { session_id: 's', event_type } }, res, mockNext());
        expect(res.statusCode).toBe(202);
        expect(db.query.mock.calls[0][0]).toMatch(/INSERT INTO amchi_demo_events/);
    });

    test('rejects unknown event_type', async () => {
        const res = mockRes();
        await handlers.event({ body: { session_id: 's', event_type: 'rage_click' } }, res, mockNext());
        expect(res.statusCode).toBe(400);
    });

    test('rejects missing session_id', async () => {
        const res = mockRes();
        await handlers.event({ body: { event_type: 'record_click' } }, res, mockNext());
        expect(res.statusCode).toBe(400);
    });

    test('accepts null feedback_id', async () => {
        const res = mockRes();
        await handlers.event({ body: { session_id: 's', event_type: 'record_click' } }, res, mockNext());
        expect(res.statusCode).toBe(202);
        const params = db.query.mock.calls[0][1];
        expect(params[1]).toBeNull(); // feedback_id
    });

    test('forwards event_target + event_value + user_agent', async () => {
        const res = mockRes();
        await handlers.event({
            body: {
                session_id: 's',
                feedback_id: 'fid',
                event_type: 'thumb_click',
                event_target: 'raw',
                event_value: 'up',
                user_agent: 'firefox/x',
            },
        }, res, mockNext());
        expect(res.statusCode).toBe(202);
        const params = db.query.mock.calls[0][1];
        expect(params).toEqual(['s', 'fid', 'thumb_click', 'raw', 'up', 'firefox/x']);
    });
});

// ---------------------------------------------------------------------------
// survey
// ---------------------------------------------------------------------------

describe('survey', () => {
    let db, handlers;
    beforeEach(() => {
        db = mockDb();
        handlers = makeHandlers({ tablePrefix: 'amchi_demo', db, r2: null });
    });

    test('happy path returns 201', async () => {
        const res = mockRes();
        await handlers.survey({
            body: { session_id: 's', q1_clarity: 4, q2_likelihood: 5, comments: 'lovely' },
        }, res, mockNext());
        expect(res.statusCode).toBe(201);
        expect(db.queryOne.mock.calls[0][0]).toMatch(/INSERT INTO amchi_user_survey/);
    });

    test('rejects q1 out of range (0)', async () => {
        const res = mockRes();
        await handlers.survey({ body: { session_id: 's', q1_clarity: 0, q2_likelihood: 3 } }, res, mockNext());
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/q1_clarity/);
    });

    test('rejects q1 out of range (6)', async () => {
        const res = mockRes();
        await handlers.survey({ body: { session_id: 's', q1_clarity: 6, q2_likelihood: 3 } }, res, mockNext());
        expect(res.statusCode).toBe(400);
    });

    test('rejects q2 out of range', async () => {
        const res = mockRes();
        await handlers.survey({ body: { session_id: 's', q1_clarity: 3, q2_likelihood: 99 } }, res, mockNext());
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/q2_likelihood/);
    });

    test('rejects non-integer q1', async () => {
        const res = mockRes();
        await handlers.survey({ body: { session_id: 's', q1_clarity: 3.5, q2_likelihood: 3 } }, res, mockNext());
        expect(res.statusCode).toBe(400);
    });

    test('rejects missing session_id', async () => {
        const res = mockRes();
        await handlers.survey({ body: { q1_clarity: 3, q2_likelihood: 3 } }, res, mockNext());
        expect(res.statusCode).toBe(400);
    });

    test('comments optional', async () => {
        const res = mockRes();
        await handlers.survey({ body: { session_id: 's', q1_clarity: 3, q2_likelihood: 3 } }, res, mockNext());
        expect(res.statusCode).toBe(201);
    });

    test('rejects non-string comments', async () => {
        const res = mockRes();
        await handlers.survey({
            body: { session_id: 's', q1_clarity: 3, q2_likelihood: 3, comments: 42 }
        }, res, mockNext());
        expect(res.statusCode).toBe(400);
    });
});

// ---------------------------------------------------------------------------
// Variant separation — amchi vs deaf
// ---------------------------------------------------------------------------

describe('variant separation', () => {
    test('amchi prefix writes to amchi_* tables, never deaf_*', async () => {
        const db = mockDb();
        const handlers = makeHandlers({ tablePrefix: 'amchi_demo', db, r2: null });

        await handlers.feedbackInit({ body: { ...BASE_INIT_BODY } }, mockRes(), mockNext());
        await handlers.feedbackUpdate({ body: { id: 'r1', thumb_raw: 'up' } }, mockRes(), mockNext());
        await handlers.event({ body: { session_id: 's', event_type: 'record_click' } }, mockRes(), mockNext());
        await handlers.survey({ body: { session_id: 's', q1_clarity: 3, q2_likelihood: 3 } }, mockRes(), mockNext());

        const allSql = [
            ...db.query.mock.calls.map(c => c[0]),
            ...db.queryOne.mock.calls.map(c => c[0]),
        ].join('\n');
        expect(allSql).toMatch(/amchi_demo_feedback/);
        expect(allSql).toMatch(/amchi_demo_events/);
        expect(allSql).toMatch(/amchi_user_survey/);
        expect(allSql).not.toMatch(/deaf_/);
    });

    test('deaf prefix writes to deaf_* tables, never amchi_*', async () => {
        const db = mockDb();
        const handlers = makeHandlers({ tablePrefix: 'deaf_demo', db, r2: null });

        await handlers.feedbackInit({ body: { ...BASE_INIT_BODY } }, mockRes(), mockNext());
        await handlers.feedbackUpdate({ body: { id: 'r1', thumb_raw: 'up' } }, mockRes(), mockNext());
        await handlers.event({ body: { session_id: 's', event_type: 'record_click' } }, mockRes(), mockNext());
        await handlers.survey({ body: { session_id: 's', q1_clarity: 3, q2_likelihood: 3 } }, mockRes(), mockNext());

        const allSql = [
            ...db.query.mock.calls.map(c => c[0]),
            ...db.queryOne.mock.calls.map(c => c[0]),
        ].join('\n');
        expect(allSql).toMatch(/deaf_demo_feedback/);
        expect(allSql).toMatch(/deaf_demo_events/);
        expect(allSql).toMatch(/deaf_user_survey/);
        expect(allSql).not.toMatch(/amchi_/);
    });
});
