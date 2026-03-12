/**
 * Structured logger for Cloud Functions.
 * Outputs JSON logs compatible with Cloud Logging / Stackdriver.
 */

type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

interface LogEntry {
  severity: LogLevel;
  message: string;
  timestamp: string;
  [key: string]: unknown;
}

function log(severity: LogLevel, message: string, context?: Record<string, unknown>): void {
  const entry: LogEntry = {
    severity,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  };

  // Cloud Logging picks up severity from JSON when written to stdout/stderr
  if (severity === 'ERROR' || severity === 'CRITICAL') {
    console.error(JSON.stringify(entry));
  } else if (severity === 'WARNING') {
    console.warn(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => log('DEBUG', message, context),
  info: (message: string, context?: Record<string, unknown>) => log('INFO', message, context),
  warn: (message: string, context?: Record<string, unknown>) => log('WARNING', message, context),
  error: (message: string, context?: Record<string, unknown>) => log('ERROR', message, context),
  critical: (message: string, context?: Record<string, unknown>) => log('CRITICAL', message, context),
};
