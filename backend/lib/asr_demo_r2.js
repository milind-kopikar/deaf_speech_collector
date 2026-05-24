/**
 * Cloudflare R2 client for the ASR live-demo telemetry feature.
 *
 * Deliberately independent of `backend/storage.js`: the existing Storage
 * singleton is bound to ONE bucket (the collector's main `S3_BUCKET`) via
 * its constructor, and the ASR-demo writes to a different bucket
 * (`R2_DEMO_BUCKET`). Mixing them in a single singleton would either break
 * the existing recordings path or require a refactor we don't need.
 *
 * R2 is S3-compatible — we use the same `@aws-sdk/client-s3` already in
 * the package's dependencies. Cloudflare's endpoint format is
 * `https://<account_id>.r2.cloudflarestorage.com`.
 *
 * Exports a factory `makeR2Uploader({ bucket, accountId, accessKeyId,
 * secretAccessKey })` so it can be unit-tested with a mocked S3 client.
 * The default export reads env vars and returns a ready-to-use instance.
 */

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

/**
 * @param {Object} cfg
 * @param {string} cfg.bucket            - R2 bucket name
 * @param {string} cfg.accountId         - Cloudflare account id (sub-domain of the endpoint URL)
 * @param {string} cfg.accessKeyId       - R2 API token access key
 * @param {string} cfg.secretAccessKey   - R2 API token secret
 * @param {Object} [cfg.s3Client]        - Optional pre-built client (for tests)
 * @returns {{uploadWav: (id: string, audioBase64: string) => Promise<string|null>, bucket: string}}
 *
 * The returned `uploadWav(id, audioBase64)`:
 *  - decodes base64 → Buffer
 *  - PUTs to `s3://<bucket>/<id>.wav`
 *  - on success returns the canonical URL
 *      `https://<bucket>.<accountId>.r2.cloudflarestorage.com/<id>.wav`
 *  - on failure returns null (caller logs + still inserts the DB row).
 */
function makeR2Uploader({ bucket, accountId, accessKeyId, secretAccessKey, s3Client } = {}) {
    if (!bucket) {
        throw new Error('makeR2Uploader: `bucket` is required');
    }
    if (!s3Client) {
        if (!accountId || !accessKeyId || !secretAccessKey) {
            throw new Error('makeR2Uploader: accountId, accessKeyId, secretAccessKey required when s3Client is not provided');
        }
        s3Client = new S3Client({
            region: 'auto',
            endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
            credentials: { accessKeyId, secretAccessKey },
        });
    }

    async function uploadWav(id, audioBase64) {
        if (!id || typeof id !== 'string') {
            throw new Error('uploadWav: `id` must be a non-empty string');
        }
        if (!audioBase64 || typeof audioBase64 !== 'string') {
            throw new Error('uploadWav: `audioBase64` must be a non-empty string');
        }

        let buffer;
        try {
            buffer = Buffer.from(audioBase64, 'base64');
        } catch (err) {
            throw new Error(`uploadWav: failed to decode base64: ${err.message}`);
        }
        if (buffer.length === 0) {
            throw new Error('uploadWav: decoded audio is empty');
        }

        const key = `${id}.wav`;
        try {
            await s3Client.send(new PutObjectCommand({
                Bucket: bucket,
                Key: key,
                Body: buffer,
                ContentType: 'audio/wav',
            }));
        } catch (err) {
            // Don't throw — caller decides whether to fail the request or not.
            console.warn(`R2 upload failed for ${key}: ${err.message}`);
            return null;
        }

        // We don't presign here — the bucket is meant to be private and the
        // URL is just an identifier the consumer can use to construct a
        // presigned read URL later. If the deployment has the bucket set to
        // public, this URL also works directly.
        return `https://${bucket}.${accountId}.r2.cloudflarestorage.com/${key}`;
    }

    return { uploadWav, bucket };
}

/**
 * Default export: builds an uploader from environment variables.
 * Returns `null` if R2 is not configured (graceful — feature degrades by
 * skipping the upload step and inserting rows with `audio_url = NULL`).
 */
function fromEnv() {
    const bucket = process.env.R2_DEMO_BUCKET;
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

    if (!bucket || !accountId || !accessKeyId || !secretAccessKey) {
        console.warn(
            '[asr_demo_r2] R2 env vars not fully set; audio uploads will be skipped. ' +
            'Set R2_DEMO_BUCKET, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.'
        );
        return null;
    }

    return makeR2Uploader({ bucket, accountId, accessKeyId, secretAccessKey });
}

module.exports = {
    makeR2Uploader,
    fromEnv,
};
