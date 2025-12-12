/**
 * Centralized error handling middleware
 */

function errorHandler(err, req, res, next) {
    console.error('Error:', err);

    // Default error response
    const response = {
        error: err.message || 'Internal server error',
        timestamp: new Date().toISOString(),
        path: req.path,
    };

    // Include stack trace in development
    if (process.env.NODE_ENV === 'development') {
        response.stack = err.stack;
    }

    // Determine status code
    const statusCode = err.statusCode || err.status || 500;

    res.status(statusCode).json(response);
}

// 404 handler
function notFoundHandler(req, res) {
    res.status(404).json({
        error: 'Not found',
        path: req.path,
        message: `Route ${req.method} ${req.path} does not exist`,
    });
}

module.exports = {
    errorHandler,
    notFoundHandler,
};
