import type { VercelRequest, VercelResponse } from '@vercel/node';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_BODY_BYTES = 32_000;
const MAX_MESSAGES = 30;
const MAX_MESSAGE_CHARS = 8_000;

function send(res: VercelResponse, status: number, body: unknown): void {
  res.status(status).json(body);
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    send(res, 405, { error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    send(res, 503, { error: 'AI service is not configured on the server.' });
    return;
  }

  const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    send(res, 413, { error: 'Request too large.' });
    return;
  }

  let body: { model?: unknown; messages?: unknown; temperature?: unknown; max_tokens?: unknown };
  try {
    body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(raw);
  } catch {
    send(res, 400, { error: 'Invalid JSON.' });
    return;
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > MAX_MESSAGES) {
    send(res, 400, { error: 'Invalid messages.' });
    return;
  }

  const messages = body.messages.map((message) => {
    if (!message || typeof message !== 'object') throw new Error('Invalid message');
    const m = message as { role?: unknown; content?: unknown };
    if (!['system', 'user', 'assistant'].includes(String(m.role)) || typeof m.content !== 'string' || m.content.length > MAX_MESSAGE_CHARS) {
      throw new Error('Invalid message');
    }
    return { role: m.role, content: m.content };
  });

  const model = typeof body.model === 'string' && body.model.length <= 200 ? body.model : 'openai/gpt-4o-mini';
  const payload = {
    model,
    messages,
    ...(typeof body.temperature === 'number' ? { temperature: Math.max(0, Math.min(2, body.temperature)) } : {}),
    ...(typeof body.max_tokens === 'number' ? { max_tokens: Math.max(1, Math.min(4000, Math.floor(body.max_tokens))) } : {}),
  };

  try {
    const upstream = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.PUBLIC_APP_URL || 'https://chatgptbm.vercel.app',
        'X-Title': 'Business Manager',
      },
      body: JSON.stringify(payload),
    });

    const text = await upstream.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = { error: 'AI provider returned invalid JSON.' }; }
    send(res, upstream.status, data);
  } catch {
    send(res, 502, { error: 'AI provider is temporarily unavailable.' });
  }
}
