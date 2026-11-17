# The Allin Family Dynamic Adverts

A small standalone Node.js and Express.js HTTP service. This initial bootstrap provides an online landing page and a health endpoint. Advert generation, scheduling, storage and integration with the family website are not implemented.

`src/index.js` owns process startup/signals; `src/config/server-config.js` validates configuration; `src/http/app.js` owns Express routes/responses; `src/server/http-server.js` owns listener limits and graceful closure. There are no speculative advert-service layers.

## Run locally

Use Node.js **24 LTS** and npm. `.node-version` selects the 24.x line and `package.json` bounds it to `>=24 <25`. Express **5.3.0** is the only direct dependency; its exact version and transitive dependencies are locked in `package-lock.json` for `npm ci`. No body parser or proxy trust override is enabled because this bootstrap needs neither.

```sh
npm ci
npm run build
npm test
npm start
```

`build` performs real JavaScript syntax validation of source, scripts and tests. There is no compilation or generated output; `start` runs the source directly. `test` uses Node's built-in runner and isolated ephemeral ports.

The default listener is `0.0.0.0:8000`. Open `http://localhost:8000/`. `PORT` must be a whole integer from 1 to 65535; `HOST` must be an IPv4 or IPv6 address. Invalid configuration or a listener error exits unsuccessfully without printing environment values or internal stacks.

The existing family API may already occupy `127.0.0.1:8000`. Do not stop it. On Windows, run this service on another loopback address while retaining port 8000:

```powershell
$env:HOST = '127.0.0.2'
$env:PORT = '8000'
npm start
```

Then open `http://127.0.0.2:8000/`. These variables apply to that shell; remove them when finished with `Remove-Item Env:HOST, Env:PORT`.

## HTTP behaviour

- `GET /`: accessible, semantic HTML confirming the service is online.
- `GET /health`: HTTP 200 with `{"status":"ok"}`. This confirms the HTTP process responds; there are no downstream services yet.
- `HEAD`: the corresponding GET status and headers, with no response body.
- Unknown paths: HTTP 404. Unsupported methods on known paths: HTTP 405 with `Allow: GET, HEAD`.
- Request bodies are unsupported: HTTP 413 and connection closure, without buffering uploads. Responses never echo request data.

Headers are limited to 16 KiB. Header/request/inactivity timeouts are 10/15/15 seconds, keep-alive is 5 seconds, and each socket permits at most 100 requests. SIGTERM/SIGINT stops accepting requests and allows up to 10 seconds to close active requests; exceeding the deadline closes remaining connections and exits unsuccessfully. There is no persistent state or authentication in this public status-only service.

## Render deployment

Create a **Web Service** from `MeGallin/The-Allin-Family-Dynamic-Adverts` with:

| Setting | Value |
| --- | --- |
| Runtime | Node |
| Branch | `main` |
| Root directory | Repository root (leave blank) |
| Region | Frankfurt |
| Instance | Free ($0) |
| Build command | `npm ci && npm run build` |
| Start command | `npm start` |
| Health check path | `/health` |
| Environment | `PORT=8000`; leave `HOST` unset so it binds `0.0.0.0` |
| Auto-deploy | Off; releases remain explicit |

The public URL uses Render's HTTPS address; port 8000 is the internal HTTP listener. Render supplies `PORT`, and an explicit `PORT=8000` retains the requested listener. Do not carry the local loopback `HOST` override into Render. Avoid a conflicting `NODE_VERSION` override because it takes precedence over `.node-version`.

Free instances can sleep when idle and take time to wake. This bootstrap needs no paid plan, database, secrets, LLM credentials or disk. It does not alter the existing family client/API hosting. Building locally does not deploy anything; deployment and live checks are separate parent-owned release steps.

Runtime choice verified against the [Node release schedule](https://nodejs.org/en/about/previous-releases) and [Render Node version documentation](https://render.com/docs/node-version) on 17 November 2026: Node 24 is supported LTS and Render currently defaults new services to 24.22.1. The explicit major constraint permits compatible 24.x security updates.

Express 5.x support and Node compatibility were checked against the [official Express support policy](https://expressjs.com/en/support/); `npm view express version engines --json` reported stable 5.3.0 requiring Node >=18 on the same date.
