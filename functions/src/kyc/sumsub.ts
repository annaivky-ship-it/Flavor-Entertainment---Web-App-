import * as crypto from 'crypto';

const SUMSUB_APP_TOKEN = process.env.SUMSUB_APP_TOKEN;
const SUMSUB_SECRET_KEY = process.env.SUMSUB_SECRET_KEY;

if (!SUMSUB_APP_TOKEN || !SUMSUB_SECRET_KEY) {
  throw new Error('Missing required env vars: SUMSUB_APP_TOKEN and/or SUMSUB_SECRET_KEY');
}
const SUMSUB_BASE_URL = 'https://api.sumsub.com';

function createSignature(config: { method: string; url: string; body?: string; ts: number }) {
  const hmac = crypto.createHmac('sha256', SUMSUB_SECRET_KEY);
  hmac.update(config.ts + config.method + config.url);
  if (config.body) {
    hmac.update(config.body);
  }
  return hmac.digest('hex');
}

export async function generateAccessToken(externalUserId: string, levelName: string = 'basic-kyc-level') {
  const ts = Math.floor(Date.now() / 1000);
  const url = `/resources/accessTokens?userId=${externalUserId}&levelName=${levelName}`;
  const signature = createSignature({ method: 'POST', url, ts });

  const response = await fetch(`${SUMSUB_BASE_URL}${url}`, {
    method: 'POST',
    headers: {
      'X-App-Token': SUMSUB_APP_TOKEN,
      'X-App-Access-Sig': signature,
      'X-App-Access-Ts': ts.toString(),
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Sumsub API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.token;
}

export function verifyWebhookSignature(payload: string, signature: string) {
  const hmac = crypto.createHmac('sha256', SUMSUB_SECRET_KEY);
  hmac.update(payload);
  const calculatedSignature = hmac.digest('hex');
  return calculatedSignature === signature;
}
