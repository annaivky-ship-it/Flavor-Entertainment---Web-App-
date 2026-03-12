import { describe, it, expect } from 'vitest';
import { calculateBookingCost, formatMinutesToHoursAndMinutes, getBookingDurationInfo } from '../utils/bookingUtils';

// Real service IDs from mockData.ts:
// Hourly: waitress-lingerie ($110/hr, min 1h), waitress-topless ($160/hr, min 1h), waitress-nude ($260/hr, min 1h)
// Flat: show-hot-cream ($380, 10min), show-pearl ($500, 15min), show-toy ($550, 15min)
// Promo: misc-promo-model ($100/hr, min 2h)

describe('calculateBookingCost', () => {
  it('returns zero when no services selected', () => {
    const result = calculateBookingCost(2, [], 1);
    expect(result.totalCost).toBe(0);
    expect(result.depositAmount).toBe(0);
  });

  it('returns zero when numPerformers is zero', () => {
    const result = calculateBookingCost(2, ['waitress-topless'], 0);
    expect(result.totalCost).toBe(0);
    expect(result.depositAmount).toBe(0);
  });

  it('calculates hourly rate correctly for single performer', () => {
    // waitress-topless: $160/hr, min 1 hour, booking 3 hours
    const result = calculateBookingCost(3, ['waitress-topless'], 1);
    expect(result.totalCost).toBe(480); // 160 * 3
    expect(result.depositAmount).toBe(120); // 25% of 480
  });

  it('enforces minimum duration for hourly services', () => {
    // misc-promo-model: $100/hr, min 2 hours — requesting 1 hour should still use 2
    const result = calculateBookingCost(1, ['misc-promo-model'], 1);
    expect(result.totalCost).toBe(200); // 100 * max(1, 2) = 100 * 2
    expect(result.depositAmount).toBe(50);
  });

  it('calculates flat rate services correctly', () => {
    // show-hot-cream: $380 flat
    const result = calculateBookingCost(0, ['show-hot-cream'], 1);
    expect(result.totalCost).toBe(380);
    expect(result.depositAmount).toBe(95);
  });

  it('multiplies hourly cost by number of performers', () => {
    // waitress-topless: $160/hr, 2 performers, 3 hours
    const result = calculateBookingCost(3, ['waitress-topless'], 2);
    expect(result.totalCost).toBe(960); // (160 * 3) * 2
    expect(result.depositAmount).toBe(240);
  });

  it('handles mixed hourly and flat services', () => {
    // waitress-lingerie: $110/hr (min 1h) + show-hot-cream: $380 flat
    const result = calculateBookingCost(2, ['waitress-lingerie', 'show-hot-cream'], 1);
    // hourly: 110*2=220, flat: 380, total: (220*1)+380=600
    expect(result.totalCost).toBe(600);
    expect(result.depositAmount).toBe(150);
  });

  it('handles unknown service IDs gracefully', () => {
    const result = calculateBookingCost(2, ['nonexistent-service'], 1);
    expect(result.totalCost).toBe(0);
    expect(result.depositAmount).toBe(0);
  });
});

describe('formatMinutesToHoursAndMinutes', () => {
  it('returns N/A for zero or negative', () => {
    expect(formatMinutesToHoursAndMinutes(0)).toBe('N/A');
    expect(formatMinutesToHoursAndMinutes(-10)).toBe('N/A');
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
    expect(formatMinutesToHoursAndMinutes(150)).toBe('2 hours 30 minutes');
  });

  it('handles singular minute', () => {
    expect(formatMinutesToHoursAndMinutes(1)).toBe('1 minute');
    expect(formatMinutesToHoursAndMinutes(61)).toBe('1 hour 1 minute');
  });
});

describe('getBookingDurationInfo', () => {
  it('returns zero for no services', () => {
    const info = getBookingDurationInfo(2, []);
    expect(info.totalDurationMinutes).toBe(0);
    expect(info.hasHourlyService).toBe(false);
  });

  it('includes base duration for hourly services', () => {
    const info = getBookingDurationInfo(2, ['waitress-topless']);
    expect(info.hasHourlyService).toBe(true);
    expect(info.baseDurationMinutes).toBe(120);
    expect(info.totalDurationMinutes).toBe(120);
  });

  it('adds show duration for flat-rate services', () => {
    // show-hot-cream: 10 min duration
    const info = getBookingDurationInfo(0, ['show-hot-cream']);
    expect(info.hasHourlyService).toBe(false);
    expect(info.baseDurationMinutes).toBe(0);
    expect(info.showDurationMinutes).toBe(10);
    expect(info.totalDurationMinutes).toBe(10);
  });

  it('combines hourly and flat durations', () => {
    // 2 hours hourly + 10 min show
    const info = getBookingDurationInfo(2, ['waitress-topless', 'show-hot-cream']);
    expect(info.hasHourlyService).toBe(true);
    expect(info.baseDurationMinutes).toBe(120);
    expect(info.showDurationMinutes).toBe(10);
    expect(info.totalDurationMinutes).toBe(130);
  });
});
