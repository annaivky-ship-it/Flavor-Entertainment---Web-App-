/**
 * SMS templates. Only used for the client-side WhatsApp fallback.
 */

import type { BookingTemplateData } from '../whatsapp/templates';

function render(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w_]+)\s*\}\}/g, (_, key) => {
    const value = data[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

const CLIENT_BACKUP_SMS = `Hi {{client_name}}, your Flavor Entertainers booking request has been received.

Booking ID: {{booking_id}}
Service: {{service}}
Date: {{event_date}}
Time: {{event_time}}
Deposit Due: \${{deposit_amount}}

Status: Pending confirmation.`;

export function renderClientBackupSms(data: BookingTemplateData): string {
  return render(CLIENT_BACKUP_SMS, data as unknown as Record<string, unknown>);
}
