/**
 * Lightweight error reporter.
 *
 * Strategy:
 *   - If `VITE_SENTRY_DSN` is set AND `@sentry/browser` is installed,
 *     forward errors to Sentry.
 *   - Otherwise, write a structured console.error so it's still grep-able
 *     in Vercel logs.
 *
 * Sentry is imported dynamically and the import failure is swallowed —
 * the reporter is best-effort and must never break the host app.
 */

type Severity = 'fatal' | 'error' | 'warning' | 'info';

interface ErrorContext {
  // Surface area where the error originated (e.g. "BookingProcess").
  component?: string;
  // Free-form structured metadata. Avoid PII here — names, emails, phone
  // numbers should NOT be sent to a third-party error sink.
  extra?: Record<string, unknown>;
  // Stable identifier for the actor (e.g. uid). Never include PII.
  userId?: string;
  // React error info — only the componentStack is forwarded.
  componentStack?: string;
}

let sentryReady = false;
let sentry: any | null = null;

async function ensureSentry(): Promise<any | null> {
  if (sentry) return sentry;
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return null;
  if (sentryReady) return sentry;
  sentryReady = true;
  try {
    // Use an indirect specifier + @vite-ignore so Vite/Rollup do not try to
    // resolve @sentry/browser at build time. If the package isn't installed
    // (the common case in this repo) the dynamic import simply rejects and
    // we fall back to console.
    const sentryModuleName = '@sentry/browser';
    const mod: any = await import(/* @vite-ignore */ sentryModuleName);
    mod.init({
      dsn,
      environment: import.meta.env.VITE_APP_MODE || import.meta.env.MODE,
      tracesSampleRate: 0,
      // Don't auto-attach window.onerror — we drive everything through this
      // module so PII scrubbing rules in one place.
      integrations: (defaults: any[]) =>
        defaults.filter((i: any) => i?.name !== 'BrowserApiErrors'),
    });
    sentry = mod;
    return sentry;
  } catch {
    return null;
  }
}

// Strip values that look like email addresses or phone numbers from extras
// before forwarding to Sentry. The audit calls these out as PII.
function scrub(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[deep]';
  if (value == null) return value;
  if (typeof value === 'string') {
    if (/^\S+@\S+\.\S+$/.test(value)) return '[email]';
    if (/^\+?\d[\d\s()-]{6,}$/.test(value)) return '[phone]';
    return value.length > 500 ? value.slice(0, 500) + '…' : value;
  }
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/email|phone|mobile|address|name/i.test(k)) {
        out[k] = '[redacted]';
      } else {
        out[k] = scrub(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

export async function reportError(error: unknown, ctx: ErrorContext = {}, severity: Severity = 'error') {
  const err = error instanceof Error ? error : new Error(String(error));
  const safeCtx = scrub(ctx) as ErrorContext;

  const s = await ensureSentry();
  if (s) {
    try {
      s.withScope((scope: any) => {
        scope.setLevel(severity);
        if (ctx.userId) scope.setUser({ id: ctx.userId });
        if (safeCtx.component) scope.setTag('component', safeCtx.component);
        if (safeCtx.extra) scope.setContext('extra', safeCtx.extra as any);
        if (safeCtx.componentStack) {
          scope.setContext('react', { componentStack: safeCtx.componentStack });
        }
        s.captureException(err);
      });
      return;
    } catch {
      // fall through to console
    }
  }

  // Structured console output so it's grep-able in Vercel logs even
  // without Sentry.
  // eslint-disable-next-line no-console
  console.error('[error-reporter]', {
    severity,
    message: err.message,
    stack: err.stack,
    ...safeCtx,
  });
}

export function reportMessage(message: string, ctx: ErrorContext = {}, severity: Severity = 'info') {
  return reportError(new Error(message), ctx, severity);
}
