# The Allin Family Dynamic Adverts

Local automatic rotation now reuses the existing PHP publication cadence/admin controls. Bounded weighted round-robin feature metadata gives fair eligible-service coverage; allowed layouts cycle visibly while the LLM creates each campaign. A LOCAL-only foreground PHP worker (`bin/advertising-worker.php run|status|stop`, API cwd) checks normal due work every5seconds, with private singleton/stop/heartbeat metadata and no service installation. Parent owns enabling budgets/configuration and launch. Browser GETs do not generate; new authoritative paired publications replace old copy/art together after image readiness, superseding the earlier frozen-page policy. No state/budget reset or content archive is introduced. See [API local worker/rotation contract](../api/docs/advertising.md).

Campaign composition is now model-selected together with the creative idea: `poster`, `split` or `image-led` from the administrator's allowed image.layouts. Default hook maximum5 words (configurable2–8), with3–5 the creative aim and an explicit cap2 supported. New image-enabled output includes required composition; Node/PHP validate it and both word/character limits. The Images prompt protects the actual renderer's type/CTA zones on a complete nearly-square247×231 canvas, rather than attaching a generic picture to an explanatory paragraph. Legacy current images remain compatible through an additive schema3 configuration upgrade; no generated HTML/CSS/URLs or body rewrite. See [API composition contract](../api/docs/advertising.md).

The running pipeline now supports optional **dynamic image generation**: the text model creates an original feature-specific visual brief, then a separately reserved durable image grant calls `/v1/images/generations` using gpt-image-2.6-flare/sunburst. Quality and independent complexity low/medium/high,1024square/1536×1024,15–120s, JPEG/opaque/n1 only. The result uploads through signed fenced PHP private storage and commits only as the candidate's paired opaque image ID; there is no static feature artwork map or Codex skill dependency. Current/candidate replacement cleans old private assets; authenticated same-origin serving and session-memory Blob URLs permit safe complete-pair transitions.

Image output has no provider token cap. Its configurable estimated USD reservation (default2USD) is explicitly **not an absolute invoice guarantee**; image counts/calls are capped separately, observed usage settles when valid, unknown or estimate-exceeding costs pause. Default image generation and image caps are off/zero. See [API dynamic image contract](../api/docs/advertising.md) for rates, full312/332/360/375-second workflow bounds, private JPEG validation/cleanup and synthetic tests. These image-inclusive bounds supersede the earlier text-only150-second limits below.

Node24/Express5.3 stateless advertising engine. Existing PHP administration owns authentication, catalogue/config, private durable state, budgets, scheduling and publication. No public page generates, no Node filesystem state is used, and no paid DB/scheduler or LangChain is needed.

## Run

Node24 LTS is bounded to `>=24 <25` and selected by `.node-version`. Express5.3.0 is the only direct dependency, exactly locked with its transitive graph.

```sh
npm ci
npm run build
npm test
npm start
```

Build recursively validates real source/script/test syntax; no compilation is needed. Tests use synthetic providers/ephemeral ports; cross-stack tests also require sibling API/PHP (`PHP_BINARY` override supported). Tests never load the ignored real key or make paid inference calls.

`npm start` uses process environment; load a local ignored .env explicitly with `node --env-file=.env src/index.js`. Defaults HOST0.0.0.0/PORT8000; PORT must be1–65535. Locally set HOST127.0.0.2 to preserve existing PHP127.0.0.1:8000. Never stop the API for this service.

Required engine environment: `OPENAI_API_KEY`, matching PHP `ADVERTISING_SIGNING_SECRET` (at least32characters), `ADVERTISING_BRIDGE_URL` (production `https://www.theallinfamily.co.uk/api/advertising/machine`; local-only `http://127.0.0.1:8001/advertising/machine`), NODE_ENVproduction on Render/development locally. Values are never exposed to browsers. API cwd local callback listener:

```powershell
C:/xampp/php/php.exe -S 127.0.0.1:8001 bin/advertising-bridge-router.php
```

This local-only narrow listener prevents PHP built-in single-worker callback deadlock; no DB/session/static files are served. Never bind it0.0.0.0.

## Contract

GET `/` is a semantic online page; GET `/health` returns200 `{"status":"ok"}` without downstream calls. HEAD matches GET status/headers without body. Public routes accept no bodies; unknown paths404, wrong methods405. POST-only `/v1/status` returns credential/config booleans; `/v1/generate` awaits a bounded result. Both require exact raw-body HMAC. PHP persists nonce/call grants before each paid call, so replay after Node restart cannot double-call.

Browser requests use same-origin Allin `/api`. `/v1` rejects browser Origin and OPTIONS/preflight; no credentialed wildcard/reflected CORS. HMAC is independent of Origin. Future direct embeds need a separate public read contract/origin policy.

Headers16KiB; signed job JSON32KiB; header/body-upload10/15s; response inactivity360s; keep-alive5s;100requests/socket. Text calls5–45s and image calls15–120s each; the complete configured workflow and bridge handshakes fit PHP312s wait/332s lease at maximum. Host proxy limits must accommodate configured work. Graceful shutdown stops accepting connections and allows10s; durable PHP fencing preserves ambiguous costs on interruption. Errors never return provider bodies, internal stacks or secrets.

## Generation and safety

Only OpenAI Responses is implemented. Allowed models: gpt-6-luna, gpt-6.1-sol, gpt-6.1-terra, gpt-6-astra with documented reasoning capabilities. Strict structured output, storefalse, Standard/default service tier, bounded tokens, no tools, and approved public feature metadata only. Local Luna/Sol inference was previously verified; docs/listing do not certify every model's credential entitlement.

Fresh headline/message/scenario/items reference approved facts and fixed subject/CTA/format IDs. Formats: headline, checklist, process, illustrative comparison. Plain text/length/schema/number/price/similarity checks constrain output, **not semantic truth**. Manual approval defaults on; optional review is fallible. React renders text, never model HTML/URLs/code. Scenarios/comparisons are labelled illustrative.

PHP holds one current and one candidate; swap removes old content. No archive/body audit, Node state or browser disk storage is created. Config-only exports exclude bodies/secrets. External backups/filesystems may retain bytes independently; this is not forensic erasure.

Defaults disabled/all currency/call/token caps zero. Each generation/review/retry reserves before provider work. Conservative input24K token ceiling uses UTF-8 bytes plus framing; output capped. Input cost includes up to2.5×Standard cache-write pricing. Known usage may reduce a reservation; unknown outcomes keep it and pause. Known rejected retries happen on later ticks with bounded backoff. Prices are dated/expire at most30days and are conservative estimates, not invoices. Starting the engine does not authorise spend.

## Structure and release

`src/index.js` process/signals; `config/` listener; `http/` Express; `server/` limits/closure; `security/` HMAC; `storage/` fixed PHP bridge; `providers/` model registry/Responses; `validation/` job/copy; `generation/` deterministic review workflow. PHP owns catalogue/publication/schedule/budget rather than duplicating durable domains here. Full [sibling API operations](../api/docs/advertising.md) cover private storage, config, tests, DST, cron and deployment prerequisites.

Render: Node/main, repository root, Frankfurt/Free($0), build `npm ci && npm run build`, start `npm start`, health `/health`, PORT8000/HOSTunset, auto-deployOff. HTTPS is public;8000 internal. Free sleep/cold starts may consume job deadlines and yield a conservative paused outcome. Builds do not deploy. Parent owns commits/pushes/releases/live checks; no production schema migration is required. Production private storage/URLs/signing/key and explicitly approved existing-host cron must be configured before enabling work.

Verified17Nov2026: [Node releases](https://nodejs.org/en/about/previous-releases), [Render version selection](https://render.com/docs/node-version), [Express5 support](https://expressjs.com/en/support/). Initial Standard input/output USD per1M at [OpenAI pricing](https://developers.openai.com/api/docs/pricing): Luna0.10/0.50, Sol2/10, Terra1/5, Astra10/50. See the PHP ceiling/validity rules; these are dated estimates.
