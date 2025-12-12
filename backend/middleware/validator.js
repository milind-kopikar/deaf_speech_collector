/**
 * Request validation middleware
 */

function validateRecordingUpload(req, res, next) {
    const { sentence_id, user_id } = req.body;
    const errors = [];

    if (!sentence_id || isNaN(parseInt(sentence_id))) {
        errors.push('sentence_id is required and must be a number');
    }

    if (!user_id || typeof user_id !== 'string') {
        errors.push('user_id is required and must be a string');
    }

    if (!req.file) {
        errors.push('audio file is required');
    }

    if (errors.length > 0) {
        return res.status(400).json({ errors });
    }

    next();
}

function validateStoryId(req, res, next) {
    const storyId = parseInt(req.params.storyId || req.params.id);
    
    if (isNaN(storyId)) {
        return res.status(400).json({ error: 'Invalid story ID' });
    }
    
    req.storyId = storyId;
    next();
}

function validateRecordingId(req, res, next) {
    const recordingId = parseInt(req.params.recordingId || req.params.id);
    
    if (isNaN(recordingId)) {
        return res.status(400).json({ error: 'Invalid recording ID' });
    }
    
    req.recordingId = recordingId;
    next();
}

module.exports = {
    validateRecordingUpload,
    validateStoryId,
    validateRecordingId,
};
