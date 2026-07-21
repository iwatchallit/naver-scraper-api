# Naver SmartStore Scraper API

Fastify service that captures SmartStore product payloads (`benefits` and `product-details`) via Playwright CDP, with queueing, retries, cache, metrics, and readiness checks.

## Features

- Strict SmartStore URL validation
- CDP sidecar capture with reconnect and fallback behavior
- Optional authenticated proxy path
- Worker queue + retry + deadline orchestration
- TTL success cache
- Prometheus metrics on `/metrics`
- Readiness checks on `/ready`

## Project Structure

- `src/server.ts`: runtime entrypoint
- `src/app.ts`: route wiring and dependency injection hooks
- `src/services/naver-cdp.ts`: CDP capture engine and dependency health snapshot
- `src/services/request-orchestrator.ts`: queue, retry, deadline logic
- `src/services/capture-cache.ts`: in-memory successful response cache
- `src/services/metrics.ts`: metrics registry and helpers
- `tests/unit`: isolated unit tests
- `tests/integration`: API scenario tests via `app.inject`
- `scripts/perf`: baseline, corpus, and soak harness scripts

## Requirements

- Node.js 22+ (tested with newer Node as well)
- Google Chrome installed locally for CDP sidecar mode
- Optional local proxy adapter (if evaluator requires proxied egress)
- Optional `ngrok` account and CLI for public local tunnel

## Setup

```powershell
Set-Location d:/MrScrapper
npm install
Copy-Item .env.example .env -Force
```

Update `.env`:

- Required:
  - `CDP_URL=http://127.0.0.1:9222`
- Optional proxy:
  - `PROXY_SERVER=http://127.0.0.1:8899`
  - `PROXY_USERNAME=your_username`
  - `PROXY_PASSWORD=your_password`

## Local Run (API + Sidecar + Proxy + Ngrok)

1. Build once:

```powershell
npm run build
```

2. Start Chrome CDP sidecar:

```powershell
Start-Process -FilePath "C:\Program Files\Google\Chrome\Application\chrome.exe" -ArgumentList '--remote-debugging-port=9222','--user-data-dir=D:\MrScrapper\.tmp\chrome-cdp-profile','about:blank'
```

3. Optional: start proxy adapter on `127.0.0.1:8899`.

4. Start API service (port `3000` by default):

```powershell
npm run dev
```

5. Expose API publicly with ngrok (only API port 3000):

```powershell
ngrok http 3000
```

6. Share the `https://*.ngrok-free.app` endpoint with evaluator.

Important:
- Never expose CDP port `9222` publicly.
- Keep proxy credentials only in environment variables.

## API Usage

### Health

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:3000/health" -Method Get | ConvertTo-Json -Depth 6
```

### Readiness

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:3000/ready" -Method Get | ConvertTo-Json -Depth 8
```

### Main Endpoint

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:3000/naver?productUrl=https://smartstore.naver.com/rainbows9030/products/11102379008" -Method Get | ConvertTo-Json -Depth 12
```

Expected success shape:
- `success: true`
- `benefits.state: captured|absent`
- `productDetails.state: captured`

Common error codes:
- `NAVER_INVALID_URL`
- `NAVER_SIDECAR_UNAVAILABLE`
- `NAVER_PROXY_UNAVAILABLE`
- `NAVER_PROXY_AUTH_FAILED`
- `NAVER_CAPTURE_TIMEOUT`

## Testing

```powershell
npm run test:unit
npm run test:integration
```

## Performance Harness

```powershell
npm run benchmark:baseline
npm run benchmark:corpus
npm run benchmark:soak
```

Environment knobs:
- Baseline:
  - `BASELINE_URL_FILE`
  - `BASELINE_EXPECTED_COUNT` (default `100`)
- Corpus:
  - `CORPUS_URL_FILE`
- Soak:
  - `SOAK_URL_FILE`
  - `SOAK_DURATION_SEC` (default `3600`)
  - `SOAK_INTERVAL_MS` (default `1500`)

Benchmark evidence is tracked in `docs/benchmark-summary.md`.

## Architecture

```mermaid
flowchart LR
  Client --> API[Fastify API :3000]
  API --> Orchestrator[Queue + Retry + Deadline]
  Orchestrator --> CDP[Playwright CDP Service]
  CDP --> Chrome[Chrome Sidecar :9222]
  CDP --> Proxy[Optional Proxy Adapter :8899]
  API --> Cache[TTL Success Cache]
  API --> Metrics[/metrics Prometheus]
```

## Proxy Handling Notes

- If `PROXY_SERVER` is unset, readiness reports `proxyConfigured=false`.
- If `PROXY_SERVER` is set but unreachable, `/naver` maps to `NAVER_PROXY_UNAVAILABLE`.
- Credentials are redacted in capture diagnostics.

## Additional Operator Docs

- `RUNBOOK-CDP-PROXY-CHECK.md`
- `docs/deployment/tencent-private-sidecar.md`
- `docs/benchmark-summary.md`
- `docs/security-secret-scan-checklist.md`
