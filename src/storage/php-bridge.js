import { signedHeaders } from '../security/signatures.js';

export function createPhpBridge({ url = process.env.ADVERTISING_BRIDGE_URL, secret = process.env.ADVERTISING_SIGNING_SECRET, environment = process.env.NODE_ENV, transport = fetch } = {}) {
  let target;
  try { target = new URL(url); } catch { throw new Error('Machine bridge is not configured.'); }
  const local = environment !== 'production' && target.href === 'http://127.0.0.1:8001/advertising/machine';
  const hosted = target.protocol === 'https:' && ['theallinfamily.co.uk', 'www.theallinfamily.co.uk'].includes(target.hostname)
    && target.pathname === '/api/advertising/machine' && !target.port;
  if ((!local && !hosted) || target.username || target.password || target.search || target.hash || !secret || secret.length < 32) throw new Error('Machine bridge is not configured.');
  return async (body, imageUpload = false) => {
    const raw = JSON.stringify(body);
    const path = imageUpload ? '/advertising/machine/image' : '/advertising/machine';
    const destination = imageUpload ? new URL(target.href + '/image') : target;
    const response = await transport(destination, { method: 'POST', redirect: 'error',
      headers: signedHeaders(secret, path, raw), body: raw, signal: AbortSignal.timeout(8000) });
    const text = await readBounded(response, 32768);
    if (!response.ok) throw new Error('The durable call grant was refused.');
    return JSON.parse(text);
  };
}

export async function readBounded(response, maxBytes) {
  const chunks = []; let size = 0;
  for await (const chunk of response.body ?? []) {
    size += chunk.byteLength;
    if (size > maxBytes) { await response.body.cancel().catch(() => {}); throw new Error('Response exceeds the supported limit.'); }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}
