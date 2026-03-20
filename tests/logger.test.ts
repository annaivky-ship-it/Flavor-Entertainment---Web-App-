/* eslint-disable no-console */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Inline the logger logic since functions/ has a separate build
type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

interface LogEntry {
  severity: LogLevel;
  message: string;
  timestamp: string;
  [key: string]: unknown;
}

function log(severity: LogLevel, message: string, context?: Record<string, unknown>): void {
  const entry: LogEntry = { severity, message, timestamp: new Date().toISOString(), ...context };
  if (severity === 'ERROR' || severity === 'CRITICAL') {
    console.error(JSON.stringify(entry));
  } else if (severity === 'WARNING') {
    console.warn(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

const logger = {
  debug: (message: string, context?: Record<string, unknown>) => log('DEBUG', message, context),
  info: (message: string, context?: Record<string, unknown>) => log('INFO', message, context),
  warn: (message: string, context?: Record<string, unknown>) => log('WARNING', message, context),
  error: (message: string, context?: Record<string, unknown>) => log('ERROR', message, context),
  critical: (message: string, context?: Record<string, unknown>) => log('CRITICAL', message, context),
};

describe('logger', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('logs INFO to console.log as JSON', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.info('test message');
    expect(spy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.severity).toBe('INFO');
    expect(parsed.message).toBe('test message');
    expect(parsed.timestamp).toBeDefined();
  });

  it('logs ERROR to console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('something broke', { code: 500 });
    expect(spy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.severity).toBe('ERROR');
    expect(parsed.code).toBe(500);
  });

  it('logs WARNING to console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logger.warn('degraded performance');
    expect(spy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.severity).toBe('WARNING');
  });

  it('logs CRITICAL to console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.critical('system down');
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.severity).toBe('CRITICAL');
  });

  it('logs DEBUG to console.log', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.debug('debug info', { requestId: 'abc' });
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.severity).toBe('DEBUG');
    expect(parsed.requestId).toBe('abc');
  });

  it('includes context fields in the log entry', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.info('booking created', { bookingId: 'BK-123', userId: 'U-456' });
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.bookingId).toBe('BK-123');
    expect(parsed.userId).toBe('U-456');
  });
});
