/**
 * Global Express Error Handler
 * Catches unhandled errors from route handlers and sends a consistent JSON response.
 * Must be registered AFTER all routes: app.use(errorHandler)
 */

function errorHandler(err, req, res, _next) {
    const status = err.status || err.statusCode || 500;
    const message = err.message || 'Internal server error';

    // Log server errors (not client errors)
    if (status >= 500) {
        console.error(`[${req.method} ${req.path}] ${status}:`, err.message);
        if (process.env.NODE_ENV !== 'production') {
            console.error(err.stack);
        }
    }

    res.status(status).json({
        error: status >= 500 ? 'Internal server error' : message
    });
}

module.exports = errorHandler;
