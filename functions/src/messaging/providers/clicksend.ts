export async function sendClickSendSms(to: string, body: string, config: any): Promise<{ providerMessageId: string }> {
  const username = config.clicksend_username || process.env.CLICKSEND_USERNAME;
  const apiKey = config.clicksend_api_key || process.env.CLICKSEND_API_KEY;
  
  if (!username || !apiKey) throw new Error('ClickSend credentials missing');

  const auth = Buffer.from(`${username}:${apiKey}`).toString('base64');
  
  const response = await fetch('https://rest.clicksend.com/v3/sms/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${auth}`
    },
    body: JSON.stringify({
      messages: [
        {
          source: "sdk",
          body: body,
          to: to
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`ClickSend API error: ${response.statusText}`);
  }

  const data = await response.json();
  if (data.http_code !== 200) {
    throw new Error(`ClickSend error: ${JSON.stringify(data)}`);
  }

  return { providerMessageId: data.data.messages[0].message_id };
}
