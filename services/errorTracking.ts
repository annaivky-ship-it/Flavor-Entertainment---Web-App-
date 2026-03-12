/**
 * Error tracking service.
 *
 * To enable Sentry:
 *   1. npm install @sentry/react
 *   2. Set VITE_SENTRY_DSN in your environment
 *   3. The init() function below will auto-detect and configure Sentry
 *
 * Without Sentry configured, errors are logged to the console.
 */

interface ErrorTracker {
  init: (options: Record<string, unknown>) => void;
  captureException: (error: unknown, context?: Record<string, unknown>) => void;
  captureMessage: (message: string, level?: string) => void;
  setUser: (user: Record<string, unknown> | null) => void;
}

let tracker: ErrorTracker | null = null;

export async function initErrorTracking(): Promise<void> {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) {
    return;
  }

  try {
    // Dynamic import — only resolves if @sentry/react is installed
    const mod = await (Function('return import("@sentry/react")')() as Promise<ErrorTracker>);
    mod.init({
      dsn,
      environment: import.meta.env.VITE_APP_MODE || 'production',
      tracesSampleRate: 0.1,
    });
    tracker = mod;
  } catch {
    console.warn('[ErrorTracking] @sentry/react not installed. Install it to enable error tracking.');
  }
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (tracker) {
    tracker.captureException(error, { extra: context });
  } else {
    console.error('[ErrorTracking]', error, context);
  }
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
  if (tracker) {
    tracker.captureMessage(message, level);
  } else {
    const logFn = level === 'error' ? console.error : level === 'warning' ? console.warn : console.info;
    logFn(`[ErrorTracking] ${message}`);
  }
}

export function setUser(user: { id: string; email?: string; role?: string } | null): void {
  if (tracker) {
    tracker.setUser(user);
  }
}
