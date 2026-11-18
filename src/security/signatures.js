import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function signature(secret, timestamp, nonce, method, path, raw) {
  return createHmac('sha256', secret).update([timestamp, nonce, method, path, createHash('sha256').update(raw).digest('hex')].join('\n')).digest('hex');
}

export function signedHeaders(secret, path, raw, now = Date.now()) {
  const time = String(Math.floor(now / 1000));
  const nonce = randomBytes(16).toString('hex');
  return { 'Content-Type': 'application/json', 'X-Ad-Time': time, 'X-Ad-Nonce': nonce,
    'X-Ad-Signature': signature(secret, time, nonce, 'POST', path, raw) };
}

export function verifier(secret, clock = Date.now) {
  const nonces = new Map();
  return (headers, method, path, raw) => {
    const time = headers['x-ad-time']; const nonce = headers['x-ad-nonce']; const mac = headers['x-ad-signature'];
    const now = Math.floor(clock() / 1000);
    if (typeof secret !== 'string' || secret.length < 32 || !/^\d{10}$/.test(time ?? '')
        || Math.abs(now - Number(time)) > 120 || !/^[a-f0-9]{32}$/.test(nonce ?? '') || !/^[a-f0-9]{64}$/.test(mac ?? '')) return false;
    const expected = Buffer.from(signature(secret, time, nonce, method, path, raw), 'hex');
    if (!timingSafeEqual(expected, Buffer.from(mac, 'hex'))) return false;
    for (const [key, expires] of nonces) if (expires < now) nonces.delete(key);
    if (nonces.has(nonce) || nonces.size >= 512) return false;
    nonces.set(nonce, Number(time) + 120);
    return true;
  };
}
