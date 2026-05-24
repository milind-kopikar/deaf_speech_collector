/**
 * Bearer-token auth middleware for the ASR live-demo endpoints.
 *
 * Intentionally NOT applied to the existing collector routes
 * (recordings, sentences, etc.) — those don't currently have auth and
 * retrofitting them is out of scope. This guard is mounted only on the
 * `/api/asr-demo/*` namespace.
 *
 * Reads the shared secret from `COLLECTOR_API_KEY`. The same value must
 * be set on the Next.js webapps so their server-side proxy routes can
 * inject the `Authorization: Bearer <key>` header.
 *
 * If `COLLECTOR_API_KEY` is not set in the environment, the middleware
 * fails closed (rejects every request) and logs a startup warning — this
 * is safer than silently allowing unauthenticated writes.
 */

function requireCollectorAuth(req, res, next) {
    const expected = process.env.COLLECTOR_API_KEY;
    if (!expected) {
        // Fail closed. Logged once at startup by the route wiring code.
        return res.status(503).json({
            error: 'COLLECTOR_API_KEY not configured on the server',
        });
    }

    const header = req.headers.authorization || '';
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) {
        return res.status(401).json({ error: 'missing or malformed Authorization header' });
    }

    // Constant-time compare to avoid leaking key length via timing.
    const presented = match[1];
    if (!constantTimeEqual(presented, expected)) {
        return res.status(401).json({ error: 'invalid bearer token' });
    }

    next();
}

function constantTimeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
}

module.exports = { requireCollectorAuth, constantTimeEqual };
