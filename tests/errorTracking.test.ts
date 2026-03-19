import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initErrorTracking, captureException, captureMessage, setUser } from '../services/errorTracking';

describe('errorTracking (console fallback)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('initErrorTracking logs fallback message when no DSN', async () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    await initErrorTracking();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('console fallback'));
  });

  it('captureException logs to console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('test error');
    captureException(err, { bookingId: '123' });
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('Exception'),
      err,
      expect.objectContaining({ bookingId: '123' })
    );
  });

  it('captureException logs without context', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    captureException(new Error('no ctx'));
    expect(spy).toHaveBeenCalled();
  });

  it('captureMessage logs info by default', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    captureMessage('hello');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('hello'));
  });

  it('captureMessage logs warning level', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    captureMessage('warn msg', 'warning');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('warn msg'));
  });

  it('captureMessage logs error level', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    captureMessage('err msg', 'error');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('err msg'));
  });

  it('setUser does not throw without sentry', () => {
    expect(() => setUser({ id: '123', email: 'a@b.com', role: 'admin' })).not.toThrow();
    expect(() => setUser(null)).not.toThrow();
  });
});
