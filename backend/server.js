/**
 * Deaf Speech Collector - Main Server
 * Express app for deaf speech recording collection system
 * Supporting UN SDG Goal 3: Good Health and Well-Being
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Run auto-setup before starting server
const autoSetup = require('../scripts/auto-setup-on-deploy');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: process.env.ENABLE_CORS === 'true' ? '*' : false }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../public')));

// Serve uploaded audio files
app.use('/recordings', express.static(path.join(__dirname, '../uploads/recordings')));

// API Routes
app.use('/api/stories', require('./routes/stories'));
app.use('/api/sentences', require('./routes/sentences'));
app.use('/api/recordings', require('./routes/recordings'));
app.use('/api/users', require('./routes/users'));
app.use('/api/programmatic', require('./routes/programmatic'));
app.use('/api/admin', require('./routes/admin'));

// ASR live-demo telemetry (gated by COLLECTOR_API_KEY Bearer auth).
// See backend/routes/asr_demo.js for the full endpoint contract.
if (!process.env.COLLECTOR_API_KEY) {
    console.warn(
        '⚠️  COLLECTOR_API_KEY not set — /api/asr-demo/* will reject all requests with 503. ' +
        'Set it on Railway to enable.'
    );
}
app.use('/api/asr-demo', require('./routes/asr_demo'));

// Test endpoints (disable in production)
if (process.env.ENABLE_TEST_ENDPOINTS === 'true') {
    app.use('/api/test', require('./routes/test'));
    console.log('⚠️  Test endpoints enabled at /api/test/*');
}

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

// Run auto-setup then start server
async function startServer() {
    try {
        await autoSetup();
    } catch (error) {
        console.error('⚠️  Auto-setup failed (continuing anyway):', error.message);
    }
    
    app.listen(PORT, () => {
        console.log('='.repeat(50));
        console.log('🦻 Deaf Speech Collector Server');
        console.log('🌍 Supporting UN SDG Goal 3: Good Health and Well-Being');
        console.log('='.repeat(50));
        console.log(`Server running on http://localhost:${PORT}`);
        console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`Storage: ${process.env.STORAGE_TYPE || 'local'}`);
        console.log('='.repeat(50));
    });
}

startServer();

module.exports = app;
