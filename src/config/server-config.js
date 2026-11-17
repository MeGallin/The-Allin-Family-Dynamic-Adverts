import { isIP } from 'node:net';

export function readConfig(env = process.env) {
  const port = env.PORT ?? '8000';
  const host = env.HOST ?? '0.0.0.0';
  if (!/^[0-9]+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error('PORT must be an integer from 1 to 65535.');
  }
  if (!isIP(host)) {
    throw new Error('HOST must be an IPv4 or IPv6 address.');
  }
  return { port: Number(port), host };
}
