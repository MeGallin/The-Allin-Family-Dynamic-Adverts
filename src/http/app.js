import express from 'express';
import { verifier } from '../security/signatures.js';
import { createEngine } from '../generation/engine.js';
import { createOpenAIProvider } from '../providers/openai.js';
import { createPhpBridge } from '../storage/php-bridge.js';
import { createOpenAIImageProvider } from '../providers/openai-images.js';

const landing = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dynamic Adverts — The Allin Family</title>
</head>
<body>
  <main>
    <h1>The Allin Family Dynamic Adverts</h1>
    <p>The service is online. Welcome!</p>
    <p>The family advertising engine is ready. Administration stays in the family website.</p>
    <p><a href="/health">Check service health</a></p>
  </main>
</body>
</html>
`;

function send(req, res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(status, {
    'Content-Type': type,
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    ...extra,
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

export function createApp(options = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.disable('query parser');
  app.enable('case sensitive routing');
  app.enable('strict routing');
  // The browser uses its same-origin PHP API. Machine routes have no browser
  // CORS contract, even with a valid HMAC; preflight can never initiate work.
  app.use('/v1', (req, res, next) => {
    if (req.headers.origin || req.method === 'OPTIONS') { send(req, res, 403, '{"error":"Browser access is not permitted"}'); return; }
    next();
  });

  const secret = options.secret ?? process.env.ADVERTISING_SIGNING_SECRET;
  const verify = verifier(secret, options.clock);
  let engine = options.engine;
  if (!engine && secret) {
    try { engine = createEngine({ provider: createOpenAIProvider(), imageProvider: createOpenAIImageProvider(), bridge: createPhpBridge() }); } catch { /* Status remains available while configuration is incomplete. */ }
  }
  app.post(['/v1/generate', '/v1/status'], express.raw({ type: 'application/json', limit: '32kb' }), async (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.originalUrl !== req.path || !verify(req.headers, 'POST', req.path, req.body)) {
      send(req, res, 401, '{"error":"Machine authentication failed"}'); return;
    }
    if (req.path === '/v1/status') {
      send(req, res, 200, JSON.stringify({ ok: Boolean(engine), provider: 'openai', providerConfigured: Boolean(options.providerConfigured ?? process.env.OPENAI_API_KEY) })); return;
    }
    if (!engine) { send(req, res, 503, '{"error":"Engine is not configured"}'); return; }
    let job;
    try { job = JSON.parse(req.body.toString('utf8')); } catch { send(req, res, 400, '{"error":"Invalid JSON"}'); return; }
    const result = await engine(job);
    send(req, res, 200, JSON.stringify(result));
  });

  app.use((req, res, next) => {
    // No endpoint accepts a body. Close rather than buffering or draining uploads.
    if (req.headers['transfer-encoding'] || Number(req.headers['content-length'] ?? 0) > 0) {
      send(req, res, 413, '{"error":"Request bodies are not supported"}', undefined, { Connection: 'close' });
    } else {
      next();
    }
  });
  app.get('/', (req, res) => send(req, res, 200, landing, 'text/html; charset=utf-8'));
  app.get('/health', (req, res) => send(req, res, 200, '{"status":"ok"}'));
  app.all(['/', '/health'], (req, res) => {
    send(req, res, 405, '{"error":"Method not allowed"}', undefined, { Allow: 'GET, HEAD' });
  });
  app.all(['/v1/generate', '/v1/status'], (req, res) => {
    send(req, res, 405, '{"error":"Method not allowed"}', undefined, { Allow: 'POST' });
  });
  app.use((req, res) => send(req, res, 404, '{"error":"Not found"}'));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    send(req, res, error.type === 'entity.too.large' ? 413 : 500, '{"error":"Request could not be processed"}');
  });
  return app;
}
