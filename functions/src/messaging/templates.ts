export type TemplateKey =
  | 'NEW_BOOKING_ADMIN'
  | 'NEW_BOOKING_PERFORMER'
  | 'RECEIVED_CLIENT'
  | 'APPROVED_PAYID_CLIENT'
  | 'CONFIRMED_CLIENT'
  | 'CONFIRMED_PERFORMER'
  | 'DECLINED_CLIENT'
  | 'CANCELLED_ALL'
  | 'OTP_CLIENT'
  | 'VERIFICATION_PENDING_CLIENT'
  | 'MANUAL_REVIEW_ADMIN'
  | 'PERFORMER_FLAGGED_ADMIN';

export function renderTemplate(key: TemplateKey, data: any): string {
  const optOut = " Reply STOP to opt out.";
  const business = "Flavor Entertainers";

  const clientName = data.clientName || data.fullName || 'Client';
  const performerName = data.performerName || 'Performer';
  const eventDate = data.eventDate || 'the requested date';
  const suburb = data.suburb || data.eventAddress || 'the location';
  const depositAmount = data.depositAmount || 'required amount';
  const payIdDetails = data.payIdDetails || 'our PayID';
  const payIdReference = data.payIdReference || data.id || 'your booking ID';
  const otpCode = data.otpCode || '------';
  const isAsap = !!(data.isAsap || data.is_asap);
  const eventTime = data.eventTime || data.event_time;
  const asapTag = isAsap ? 'ASAP - ' : '';

  switch (key) {
    case 'NEW_BOOKING_ADMIN':
      return `[${business}] ${asapTag}New booking request from ${clientName} for ${performerName} on ${eventDate}.`;
    case 'NEW_BOOKING_PERFORMER':
      return isAsap
        ? `[${business}] URGENT ASAP booking - arrival needed by ${eventTime || 'within 60 minutes'} at ${suburb}. Open dashboard NOW to accept or decline.`
        : `[${business}] You have a new booking request on ${eventDate} in ${suburb}. Check your dashboard.`;
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
    case 'OTP_CLIENT':
      return `[${business}] Your verification code is ${otpCode}. It expires in 10 minutes. Do not share this code.`;
    case 'VERIFICATION_PENDING_CLIENT':
      return `[${business}] Your booking is pending a quick verification step. Please check the booking page to continue.${optOut}`;
    case 'MANUAL_REVIEW_ADMIN':
      return `[${business}] ⚠️ Booking ${payIdReference} requires manual review. Reasons: ${data.reasons || 'see queue'}.`;
    case 'PERFORMER_FLAGGED_ADMIN':
      return `[${business}] ⚠️ Performer flagged a customer on booking ${payIdReference}. Reason: ${data.reason || 'see flag'}.`;
    default:
      return `[${business}] Notification regarding your booking.`;
  }
}
