import * as crypto from 'crypto';

export async function sendMessageMediaSms(to: string, body: string, config: any): Promise<{ providerMessageId: string }> {
  const apiKey = config.messagemedia_api_key || process.env.MESSAGEMEDIA_API_KEY;
  const apiSecret = config.messagemedia_api_secret || process.env.MESSAGEMEDIA_API_SECRET;

  if (!apiKey || !apiSecret) throw new Error('MessageMedia credentials missing');

  const url = 'https://messages-api.messagemedia.com/v1/messages';
  const payload = JSON.stringify({
    messages: [
      {
        content: body,
        destination_number: to,
        format: "SMS"
      }
    ]
  });

  const now = new Date().toUTCString();
  const signatureString = `Date: ${now}\nPOST /v1/messages HTTP/1.1`;
  const hmac = crypto.createHmac('sha1', apiSecret).update(signatureString).digest('base64');
  const authHeader = `hmac username="${apiKey}", algorithm="hmac-sha1", headers="Date request-line", signature="${hmac}"`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Date': now,
      'Authorization': authHeader
    },
    body: payload
  });

  if (!response.ok) {
    throw new Error(`MessageMedia API error: ${response.statusText}`);
  }

  const data = await response.json();
  return { providerMessageId: data.messages[0].message_id };
}
