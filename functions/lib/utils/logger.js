"use strict";
/**
 * Structured logger for Cloud Functions.
 * Outputs JSON logs compatible with Cloud Logging / Stackdriver.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
function log(severity, message, context) {
    const entry = Object.assign({ severity,
        message, timestamp: new Date().toISOString() }, context);
    // Cloud Logging picks up severity from JSON when written to stdout/stderr
    if (severity === 'ERROR' || severity === 'CRITICAL') {
        console.error(JSON.stringify(entry));
    }
    else if (severity === 'WARNING') {
        console.warn(JSON.stringify(entry));
    }
    else {
        console.log(JSON.stringify(entry));
    }
}
exports.logger = {
    debug: (message, context) => log('DEBUG', message, context),
    info: (message, context) => log('INFO', message, context),
    warn: (message, context) => log('WARNING', message, context),
    error: (message, context) => log('ERROR', message, context),
    critical: (message, context) => log('CRITICAL', message, context),
};
//# sourceMappingURL=logger.js.map