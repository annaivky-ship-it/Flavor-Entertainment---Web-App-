/**
 * WhatsApp message templates for the booking automation flow.
 *
 * Templates are rendered with simple `{{var}}` substitution. Missing values
 * are replaced with an empty string so we never render `undefined` to a
 * customer-facing message.
 */

export interface BookingTemplateData {
  booking_id: string;
  performer_name: string;
  client_name: string;
  client_phone: string;
  client_email: string;
  event_date: string;
  event_time: string;
  duration: string;
  service: string;
  location: string;
  total_price: number | string;
  deposit_amount: number | string;
  payment_status: string;
  accept_url?: string;
  decline_url?: string;
}

function render(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w_]+)\s*\}\}/g, (_, key) => {
    const value = data[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

const ADMIN_TEMPLATE = `New booking request received.

Booking ID: {{booking_id}}
Client: {{client_name}}
Phone: {{client_phone}}
Performer: {{performer_name}}
Service: {{service}}
Date: {{event_date}}
Time: {{event_time}}
Duration: {{duration}}
Location: {{location}}
Total: \${{total_price}}
Deposit: \${{deposit_amount}}
Payment Status: {{payment_status}}`;

const PERFORMER_TEMPLATE = `New booking request for you.

Service: {{service}}
Date: {{event_date}}
Time: {{event_time}}
Duration: {{duration}}
Location: {{location}}

Accept: {{accept_url}}
Decline: {{decline_url}}

Do not attend until admin confirms the booking.`;

const CLIENT_TEMPLATE = `Thanks {{client_name}}, your booking request has been received.

Booking ID: {{booking_id}}
Service: {{service}}
Date: {{event_date}}
Time: {{event_time}}
Duration: {{duration}}
Location: {{location}}
Estimated Total: \${{total_price}}
Deposit Due: \${{deposit_amount}}

Your booking is pending confirmation.`;

export function renderAdminWhatsApp(data: BookingTemplateData): string {
  return render(ADMIN_TEMPLATE, data as unknown as Record<string, unknown>);
}

export function renderPerformerWhatsApp(data: BookingTemplateData): string {
  return render(PERFORMER_TEMPLATE, data as unknown as Record<string, unknown>);
}

export function renderClientWhatsApp(data: BookingTemplateData): string {
  return render(CLIENT_TEMPLATE, data as unknown as Record<string, unknown>);
}
