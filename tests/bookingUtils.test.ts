import { describe, it, expect } from 'vitest';
import { calculateBookingCost, formatMinutesToHoursAndMinutes, getBookingDurationInfo } from '../utils/bookingUtils';

describe('calculateBookingCost', () => {
  it('returns zero when no services or performers', () => {
    expect(calculateBookingCost(2, [], 1)).toEqual({ totalCost: 0, depositAmount: 0, travelFee: 0 });
    expect(calculateBookingCost(2, ['waitress-topless'], 0)).toEqual({ totalCost: 0, depositAmount: 0, travelFee: 0 });
  });

  it('calculates per-hour service correctly', () => {
    // waitress-topless: $160/hr, min 1hr
    const result = calculateBookingCost(3, ['waitress-topless'], 1);
    expect(result.totalCost).toBe(480); // 160 * 3
    expect(result.depositAmount).toBe(120); // 25% of 480
    expect(result.travelFee).toBe(0);
  });

  it('enforces minimum duration for per-hour services', () => {
    // waitress-topless: min_duration_hours = 1, rate = 160
    // If duration is 0, should use min_duration_hours of 1
    const result = calculateBookingCost(0, ['waitress-topless'], 1);
    expect(result.totalCost).toBe(160); // 160 * max(0, 1) = 160
  });

  it('calculates flat-rate service correctly', () => {
    // show-hot-cream: $380 flat
    const result = calculateBookingCost(0, ['show-hot-cream'], 1);
    expect(result.totalCost).toBe(380);
    expect(result.depositAmount).toBe(95); // 25% of 380
  });

  it('multiplies hourly cost by number of performers but not flat cost', () => {
    // waitress-topless: $160/hr * 2hrs = $320 per performer
    // show-hot-cream: $380 flat
    const result = calculateBookingCost(2, ['waitress-topless', 'show-hot-cream'], 2);
    // hourly: 160 * 2 = 320 * 2 performers = 640
    // flat: 380
    expect(result.totalCost).toBe(1020);
  });

  it('handles unknown service IDs gracefully', () => {
    const result = calculateBookingCost(2, ['nonexistent-service'], 1);
    expect(result.totalCost).toBe(0);
  });

  it('calculates deposit as 25% of total', () => {
    const result = calculateBookingCost(2, ['waitress-lingerie'], 1);
    // 110 * 2 = 220
    expect(result.depositAmount).toBe(result.totalCost * 0.25);
  });

  it('adds no travel fee for suburbs within 50km', () => {
    const result = calculateBookingCost(2, ['waitress-topless'], 1, 'Perth CBD');
    expect(result.travelFee).toBe(0);
    expect(result.totalCost).toBe(320); // 160 * 2, no travel fee
  });

  it('adds no travel fee for suburbs at exactly 50km', () => {
    const result = calculateBookingCost(2, ['waitress-topless'], 1, 'Two Rocks');
    expect(result.travelFee).toBe(0);
    expect(result.totalCost).toBe(320);
  });

  it('adds $1/km travel fee for suburbs beyond 50km', () => {
    // Mandurah is 72km from CBD => 72 - 50 = $22 travel fee
    const result = calculateBookingCost(2, ['waitress-topless'], 1, 'Mandurah');
    expect(result.travelFee).toBe(22);
    expect(result.totalCost).toBe(342); // 320 + 22
    expect(result.depositAmount).toBe(342 * 0.25);
  });

  it('adds no travel fee when suburb is not provided', () => {
    const result = calculateBookingCost(2, ['waitress-topless'], 1);
    expect(result.travelFee).toBe(0);
  });

  it('adds no travel fee for unknown suburb', () => {
    const result = calculateBookingCost(2, ['waitress-topless'], 1, 'Unknown Place');
    expect(result.travelFee).toBe(0);
  });
});

describe('formatMinutesToHoursAndMinutes', () => {
  it('returns N/A for zero or negative', () => {
    expect(formatMinutesToHoursAndMinutes(0)).toBe('N/A');
    expect(formatMinutesToHoursAndMinutes(-5)).toBe('N/A');
  });

  it('formats minutes only', () => {
    expect(formatMinutesToHoursAndMinutes(30)).toBe('30 minutes');
  });

  it('formats hours only', () => {
    expect(formatMinutesToHoursAndMinutes(60)).toBe('1 hour');
    expect(formatMinutesToHoursAndMinutes(120)).toBe('2 hours');
  });

  it('formats hours and minutes', () => {
    expect(formatMinutesToHoursAndMinutes(90)).toBe('1 hour 30 minutes');
  });

  it('handles singular minute', () => {
    expect(formatMinutesToHoursAndMinutes(61)).toBe('1 hour 1 minute');
  });
});

describe('getBookingDurationInfo', () => {
  it('returns zero duration when no services selected', () => {
    const info = getBookingDurationInfo(2, []);
    expect(info.totalDurationMinutes).toBe(0);
  });

  it('includes base duration for hourly services', () => {
    const info = getBookingDurationInfo(2, ['waitress-topless']);
    expect(info.hasHourlyService).toBe(true);
    expect(info.baseDurationMinutes).toBe(120);
  });

  it('includes show duration for flat-rate services', () => {
    // show-hot-cream: duration_minutes = 10
    const info = getBookingDurationInfo(0, ['show-hot-cream']);
    expect(info.hasHourlyService).toBe(false);
    expect(info.showDurationMinutes).toBe(10);
    expect(info.totalDurationMinutes).toBe(10);
  });

  it('combines hourly and flat durations', () => {
    // waitress-topless (hourly) + show-hot-cream (10 min flat)
    const info = getBookingDurationInfo(2, ['waitress-topless', 'show-hot-cream']);
    expect(info.totalDurationMinutes).toBe(130); // 120 + 10
  });
});
