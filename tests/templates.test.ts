import { describe, it, expect } from 'vitest';

// Inline the template logic since functions/ has a separate build
type TemplateKey =
  | 'NEW_BOOKING_ADMIN'
  | 'NEW_BOOKING_PERFORMER'
  | 'RECEIVED_CLIENT'
  | 'APPROVED_PAYID_CLIENT'
  | 'CONFIRMED_CLIENT'
  | 'CONFIRMED_PERFORMER'
  | 'DECLINED_CLIENT'
  | 'CANCELLED_ALL'
  | 'KYC_LINK_CLIENT'
  | 'KYC_PASS_CLIENT'
  | 'KYC_FAIL_CLIENT'
  | 'KYC_FLAGGED_ADMIN';

function renderTemplate(key: TemplateKey, data: Record<string, string | undefined>): string {
  const optOut = " Reply STOP to opt out.";
  const business = "Flavor Entertainers";
  const clientName = data.clientName || data.fullName || 'Client';
  const performerName = data.performerName || 'Performer';
  const eventDate = data.eventDate || 'the requested date';
  const suburb = data.suburb || data.eventAddress || 'the location';
  const depositAmount = data.depositAmount || 'required amount';
  const payIdDetails = data.payIdDetails || 'our PayID';
  const payIdReference = data.payIdReference || data.id || 'your booking ID';

  switch (key) {
    case 'NEW_BOOKING_ADMIN':
      return `[${business}] New booking request from ${clientName} for ${performerName} on ${eventDate}.`;
    case 'NEW_BOOKING_PERFORMER':
      return `[${business}] You have a new booking request on ${eventDate} in ${suburb}. Check your dashboard.`;
    case 'RECEIVED_CLIENT':
      return `[${business}] We received your booking request for ${performerName}. We will notify you once approved.${optOut}`;
    case 'APPROVED_PAYID_CLIENT':
      return `[${business}] Good news! Your booking is approved. Please pay the deposit of $${depositAmount} via PayID to ${payIdDetails} with ref ${payIdReference} to secure your date.${optOut}`;
    case 'CONFIRMED_CLIENT':
      return `[${business}] Your booking for ${performerName} on ${eventDate} is CONFIRMED! Thank you.${optOut}`;
    case 'CONFIRMED_PERFORMER':
      return `[${business}] Booking CONFIRMED for ${eventDate} in ${suburb}. Check dashboard for full details.`;
    case 'DECLINED_CLIENT':
      return `[${business}] Unfortunately, your booking request for ${performerName} could not be fulfilled at this time.${optOut}`;
    case 'CANCELLED_ALL':
      return `[${business}] The booking on ${eventDate} has been cancelled.`;
    case 'KYC_LINK_CLIENT':
      return `[${business}] To complete your booking, please verify your identity. Click here to start: ${data.verificationUrl || 'Check your email for the link.'} This step helps keep everyone safe.${optOut}`;
    case 'KYC_PASS_CLIENT':
      return `[${business}] Your identity has been verified successfully! Your booking for ${performerName} on ${eventDate} is now CONFIRMED. Thank you!${optOut}`;
    case 'KYC_FAIL_CLIENT':
      return `[${business}] Unfortunately, we were unable to verify your identity. Your deposit will be refunded. If you believe this is an error, please contact us.${optOut}`;
    case 'KYC_FLAGGED_ADMIN':
      return `[${business}] ⚠️ KYC flagged for booking ${data.id || data.booking_id || 'unknown'}. Client ${clientName} has AML flags. Manual review required.`;
    default:
      return `[${business}] Notification regarding your booking.`;
  }
}

describe('renderTemplate', () => {
  it('renders NEW_BOOKING_ADMIN with all fields', () => {
    const result = renderTemplate('NEW_BOOKING_ADMIN', {
      clientName: 'John',
      performerName: 'Emma',
      eventDate: '2025-03-15',
    });
    expect(result).toContain('John');
    expect(result).toContain('Emma');
    expect(result).toContain('2025-03-15');
    expect(result).toContain('[Flavor Entertainers]');
  });

  it('uses defaults for missing fields', () => {
    const result = renderTemplate('RECEIVED_CLIENT', {});
    expect(result).toContain('Performer');
    expect(result).toContain('Reply STOP');
  });

  it('renders APPROVED_PAYID_CLIENT with payment details', () => {
    const result = renderTemplate('APPROVED_PAYID_CLIENT', {
      depositAmount: '150',
      payIdDetails: 'payments@test.com',
      payIdReference: 'BK-ABC123',
    });
    expect(result).toContain('$150');
    expect(result).toContain('payments@test.com');
    expect(result).toContain('BK-ABC123');
  });

  it('renders KYC_LINK_CLIENT with verification URL', () => {
    const result = renderTemplate('KYC_LINK_CLIENT', {
      verificationUrl: 'https://verify.example.com/abc',
    });
    expect(result).toContain('https://verify.example.com/abc');
  });

  it('renders KYC_LINK_CLIENT with fallback when no URL', () => {
    const result = renderTemplate('KYC_LINK_CLIENT', {});
    expect(result).toContain('Check your email for the link.');
  });

  it('renders CANCELLED_ALL with event date', () => {
    const result = renderTemplate('CANCELLED_ALL', { eventDate: '2025-04-01' });
    expect(result).toContain('2025-04-01');
    expect(result).toContain('cancelled');
  });

  it('renders KYC_FLAGGED_ADMIN with booking id', () => {
    const result = renderTemplate('KYC_FLAGGED_ADMIN', { id: 'BK-999', clientName: 'Suspicious User' });
    expect(result).toContain('BK-999');
    expect(result).toContain('Suspicious User');
    expect(result).toContain('Manual review required');
  });

  it('includes opt-out message in client templates', () => {
    const clientKeys: TemplateKey[] = ['RECEIVED_CLIENT', 'CONFIRMED_CLIENT', 'DECLINED_CLIENT', 'KYC_PASS_CLIENT', 'KYC_FAIL_CLIENT'];
    for (const key of clientKeys) {
      const result = renderTemplate(key, {});
      expect(result).toContain('Reply STOP to opt out.');
    }
  });

  it('does not include opt-out in admin/performer templates', () => {
    const nonClientKeys: TemplateKey[] = ['NEW_BOOKING_ADMIN', 'NEW_BOOKING_PERFORMER', 'CONFIRMED_PERFORMER', 'CANCELLED_ALL'];
    for (const key of nonClientKeys) {
      const result = renderTemplate(key, {});
      expect(result).not.toContain('Reply STOP');
    }
  });
});
