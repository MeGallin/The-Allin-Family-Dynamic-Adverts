import express from 'express';

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
    <p>This is the initial server setup. Advert generation is not available yet.</p>
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

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.disable('query parser');
  app.enable('case sensitive routing');
  app.enable('strict routing');

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
  app.use((req, res) => send(req, res, 404, '{"error":"Not found"}'));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    send(req, res, 500, '{"error":"Internal server error"}');
  });
  return app;
}
