/**
 * Storage abstraction layer
 * Supports local filesystem and S3-compatible cloud storage
 */

const fs = require('fs').promises;
const path = require('path');
const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { createReadStream } = require('fs');

class Storage {
    constructor() {
        this.type = process.env.STORAGE_TYPE || 'local';
        
        if (this.type === 's3') {
            this.s3Client = new S3Client({
                endpoint: process.env.S3_ENDPOINT,
                region: process.env.S3_REGION || 'us-east-1',
                credentials: {
                    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                },
            });
            this.bucket = process.env.S3_BUCKET;
            console.log(`✓ Storage: S3-compatible (${this.bucket})`);
        } else {
            this.uploadDir = process.env.UPLOAD_DIR || './uploads';
            console.log(`✓ Storage: Local filesystem (${this.uploadDir})`);
        }
    }

    /**
     * Save file to storage
     * @param {Buffer|string} fileData - File buffer or path to file
     * @param {string} filename - Desired filename (e.g., 'recordings/xyz.wav')
     * @returns {Promise<string>} - Storage path or URL
     */
    async save(fileData, filename) {
        if (this.type === 's3') {
            return await this._saveToS3(fileData, filename);
        } else {
            return await this._saveToLocal(fileData, filename);
        }
    }

    /**
     * Get file from storage
     * @param {string} filepath - Path returned from save()
     * @returns {Promise<Buffer>} - File buffer
     */
    async get(filepath) {
        if (this.type === 's3') {
            return await this._getFromS3(filepath);
        } else {
            return await this._getFromLocal(filepath);
        }
    }

    /**
     * Get read stream (for efficient file serving)
     * @param {string} filepath
     * @returns {ReadableStream}
     */
    async getStream(filepath) {
        if (this.type === 's3') {
            const command = new GetObjectCommand({
                Bucket: this.bucket,
                Key: filepath,
            });
            const response = await this.s3Client.send(command);
            return response.Body;
        } else {
            const fullPath = path.join(this.uploadDir, filepath);
            return createReadStream(fullPath);
        }
    }

    /**
     * Check if file exists
     * @param {string} filepath
     * @returns {Promise<boolean>}
     */
    async exists(filepath) {
        if (this.type === 's3') {
            try {
                const command = new HeadObjectCommand({
                    Bucket: this.bucket,
                    Key: filepath,
                });
                await this.s3Client.send(command);
                return true;
            } catch (error) {
                if (error.name === 'NotFound') return false;
                throw error;
            }
        } else {
            try {
                const fullPath = path.join(this.uploadDir, filepath);
                await fs.access(fullPath);
                return true;
            } catch {
                return false;
            }
        }
    }

    /**
     * Get file size
     * @param {string} filepath
     * @returns {Promise<number>} Size in bytes
     */
    async getSize(filepath) {
        if (this.type === 's3') {
            const command = new HeadObjectCommand({
                Bucket: this.bucket,
                Key: filepath,
            });
            const response = await this.s3Client.send(command);
            return response.ContentLength;
        } else {
            const fullPath = path.join(this.uploadDir, filepath);
            const stats = await fs.stat(fullPath);
            return stats.size;
        }
    }

    // Private: S3 operations
    async _saveToS3(fileData, filename) {
        const buffer = Buffer.isBuffer(fileData) 
            ? fileData 
            : await fs.readFile(fileData);

        const upload = new Upload({
            client: this.s3Client,
            params: {
                Bucket: this.bucket,
                Key: filename,
                Body: buffer,
                ContentType: 'audio/wav',
            },
        });

        await upload.done();
        return filename; // Return S3 key
    }

    async _getFromS3(filepath) {
        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: filepath,
        });
        const response = await this.s3Client.send(command);
        return Buffer.from(await response.Body.transformToByteArray());
    }

    // Private: Local filesystem operations
    async _saveToLocal(fileData, filename) {
        const fullPath = path.join(this.uploadDir, filename);
        
        // Create directory if needed
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        
        if (Buffer.isBuffer(fileData)) {
            await fs.writeFile(fullPath, fileData);
        } else {
            // fileData is a path, copy it
            await fs.copyFile(fileData, fullPath);
        }
        
        return filename; // Return relative path
    }

    async _getFromLocal(filepath) {
        const fullPath = path.join(this.uploadDir, filepath);
        return await fs.readFile(fullPath);
    }

    /**
     * Get public URL for file (if using S3)
     * @param {string} filepath
     * @returns {string}
     */
    getPublicUrl(filepath) {
        if (this.type === 's3') {
            // Note: Assumes bucket has public read access or uses signed URLs
            // For signed URLs, use getSignedUrl() from @aws-sdk/s3-request-presigner
            const endpoint = process.env.S3_ENDPOINT.replace('https://', '');
            return `https://${this.bucket}.${endpoint}/${filepath}`;
        } else {
            // Local files served via /api/test/audio/:id endpoint
            return `/api/test/audio/${filepath}`;
        }
    }
}

// Export singleton instance
module.exports = new Storage();
