import { describe, it, expect } from 'vitest';
import { friendlyErrorMessage } from '../components/BookingProcess';

describe('friendlyErrorMessage — auth error mapping', () => {
  it('maps "authentication required" wording to a Session Expired prompt', () => {
    const result = friendlyErrorMessage('Authentication required for booking submission');
    expect(result.title).toBe('Session Expired');
    expect(result.isAuthError).toBe(true);
    expect(result.message).toContain('log in again');
  });

  it('maps Firebase auth/* error codes to a Session Expired prompt', () => {
    const result = friendlyErrorMessage('Firebase: Error (auth/user-token-expired).');
    expect(result.title).toBe('Session Expired');
    expect(result.isAuthError).toBe(true);
  });

  it('maps unauthenticated callable errors to a Session Expired prompt', () => {
    const result = friendlyErrorMessage('UNAUTHENTICATED: Missing or invalid auth token');
    expect(result.title).toBe('Session Expired');
    expect(result.isAuthError).toBe(true);
  });

  it('maps popup-closed sign-in errors to a Session Expired prompt', () => {
    const result = friendlyErrorMessage('popup-closed-by-user');
    expect(result.title).toBe('Session Expired');
    expect(result.isAuthError).toBe(true);
  });

  it('maps generic INTERNAL errors to a non-auth retry prompt', () => {
    const result = friendlyErrorMessage('INTERNAL');
    expect(result.title).toBe('Something Went Wrong');
    expect(result.isAuthError).toBe(false);
  });

  it('maps slot-already-taken errors to a Time Slot Taken prompt and preserves the raw message', () => {
    const result = friendlyErrorMessage('already-exists: time slot 19:00 is taken');
    expect(result.title).toBe('Time Slot Taken');
    expect(result.isAuthError).toBe(false);
    expect(result.message).toContain('19:00');
  });

  it('falls through to a generic Booking Error for unrecognised messages', () => {
    const result = friendlyErrorMessage('Validation failed: missing event_date');
    expect(result.title).toBe('Booking Error');
    expect(result.isAuthError).toBe(false);
    expect(result.message).toBe('Validation failed: missing event_date');
  });

  it('maps Firestore permission-denied to an Access Denied prompt', () => {
    const result = friendlyErrorMessage('permission-denied: Missing required permissions');
    expect(result.title).toBe('Access Denied');
    expect(result.isAuthError).toBe(true);
  });
});
