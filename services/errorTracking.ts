/**
 * Error tracking service.
 *
 * Currently uses console-based logging. To upgrade to Sentry:
 *   1. npm install @sentry/react
 *   2. Set VITE_SENTRY_DSN in your environment
 *   3. Replace the console calls below with Sentry equivalents
 *
 * The API surface (captureException, captureMessage, setUser) is designed
 * to be a drop-in match for Sentry's API.
 */

let currentUser: { id: string; email?: string; role?: string } | null = null;

export function initErrorTracking(): void {
  // No-op for console-based tracking.
  // When switching to Sentry, call Sentry.init() here.
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  console.error('[ErrorTracking] Exception:', error, context ?? '');
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
  const logFn = level === 'error' ? console.error : level === 'warning' ? console.warn : console.info;
  logFn(`[ErrorTracking] ${message}`);
}

export function setUser(user: { id: string; email?: string; role?: string } | null): void {
  currentUser = user;
}
