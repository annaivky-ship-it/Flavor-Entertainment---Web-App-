/**
 * Error tracking service.
 *
 * Uses Sentry when VITE_SENTRY_DSN is configured and @sentry/react is installed,
 * otherwise falls back to console-based logging.
 *
 * To enable Sentry:
 *   1. npm install @sentry/react
 *   2. Set VITE_SENTRY_DSN in .env.production
 */

/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
let sentry: any = null;
let initialized = false;

export async function initErrorTracking(): Promise<void> {
  if (initialized) return;
  initialized = true;

  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) {
    console.info('[ErrorTracking] No VITE_SENTRY_DSN configured — using console fallback');
    return;
  }

  try {
    // Dynamic import — only resolves if @sentry/react is installed
    const mod = '@sentry/react';
    sentry = await (Function('m', 'return import(m)')(mod) as Promise<any>);
    sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      enabled: import.meta.env.PROD,
      tracesSampleRate: 0.1,
    });
    console.info('[ErrorTracking] Sentry initialized');
  } catch {
    console.warn('[ErrorTracking] @sentry/react not installed — using console fallback');
    sentry = null;
  }
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (sentry) {
    sentry.captureException(error, { extra: context });
  } else {
    console.error('[ErrorTracking] Exception:', error, context ?? '');
  }
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
  if (sentry) {
    sentry.captureMessage(message, level);
  } else {
    const logFn = level === 'error' ? console.error : level === 'warning' ? console.warn : console.info;
    logFn(`[ErrorTracking] ${message}`);
  }
}

export function setUser(user: { id: string; email?: string; role?: string } | null): void {
  if (sentry) {
    sentry.setUser(user ? { id: user.id, email: user.email } : null);
  }
}
