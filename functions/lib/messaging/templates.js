"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderTemplate = renderTemplate;
function renderTemplate(key, data) {
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
//# sourceMappingURL=templates.js.map