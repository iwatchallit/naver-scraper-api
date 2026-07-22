# Naver SmartStore Scraper API

Fastify service that captures SmartStore product payloads (`benefits` and `product-details`) via Playwright CDP, with queueing, retries, cache, metrics, and readiness checks.

## Features

- Strict SmartStore URL validation
- CDP sidecar capture with reconnect and fallback behavior
- Optional authenticated proxy path
- Rotating fingerprint profiles and randomized per-request jitter
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

If you want to reuse a legitimate logged-in Naver session, save a Playwright storage state file once and set `NAVER_STORAGE_STATE_PATH` to that file. The scraper will load it into each new browser context.

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
- Optional authenticated session reuse:
  - `NAVER_STORAGE_STATE_PATH=artifacts/naver-auth/storage-state.json`

## Local Run (API + Sidecar + Proxy + Ngrok)

1. Build once:

```powershell
npm run build
```

2. Start Chrome CDP sidecar:

**Option A (Headless - Requires Residential Proxy):**
```powershell
Start-Process -FilePath "C:\Program Files\Google\Chrome\Application\chrome.exe" -ArgumentList '--headless','--remote-debugging-port=9222','--user-data-dir=D:\MrScrapper\.tmp\chrome-cdp-profile','about:blank'
```

**Option B (Headful - No Proxy Needed for Local Testing):**
```powershell
Stop-Process -Name chrome -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 2; Start-Process -FilePath "C:\Program Files\Google\Chrome\Application\chrome.exe" -ArgumentList '--remote-debugging-port=9222','--user-data-dir=D:\MrScrapper\.tmp\chrome-cdp-profile'
```
*(Leave the white browser window open. Since it's headful, Naver WAF sees it as a legitimate human user. Do NOT configure `PROXY_SERVER` in `.env` if using Option B).*

3. Optional: start proxy adapter on `127.0.0.1:8899`.

4. If the site requires a normal login session, save it once:

```powershell
npm run auth:save
```

Complete the login in the opened browser, press Enter in the terminal, and keep the resulting storage-state file on disk.

5. Start API service (port `3000` by default):

```powershell
npm run dev
```

6. Expose API publicly with ngrok (only API port 3000):

```powershell
ngrok http 3000
```

7. Share the `https://*.ngrok-free.app` endpoint with evaluator.

Important:
- Never expose CDP port `9222` publicly.
- Keep proxy credentials only in environment variables.

## Web Dashboard (UI)

The application includes a built-in Web UI (Forwarder) for easy testing and demonstration without needing cURL or Postman.

1. Open your browser and navigate to: `http://127.0.0.1:3000/`
2. Paste any Naver SmartStore Product URL.
3. Click **Scrape JSON** to execute the capture via the CDP sidecar in real-time.

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

### Anti-Detection Telemetry

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:3000/anti-detection" -Method Get | ConvertTo-Json -Depth 10
```

This endpoint exposes runtime proof fields used by submission artifacts:
- profile rotation usage
- jitter min/max and violation count
- sampled public IP behavior when `IP_SAMPLING_ENABLED=true`

## Testing

```powershell
npm run test:unit
npm run test:integration
```

## Performance Harness

```powershell
npm run benchmark:seed-corpus
npm run benchmark:baseline
npm run benchmark:corpus
npm run benchmark:triage
npm run benchmark:soak
```

Environment knobs:
- Baseline:
  - `BASELINE_URL_FILE`
  - `BASELINE_EXPECTED_COUNT` (default `100`)
- Corpus:
  - `CORPUS_URL_FILE`
- Seed corpus:
  - `CANDIDATE_URL_FILE` (default `testdata/corpus-candidates.txt`)
  - `CANDIDATE_INCLUDE_SMARTSTORE_MAIN` (default `false`)
- Triage:
  - `TRIAGE_CONCURRENCY` (default `3`)
  - `TRIAGE_REPORT_FILE` (default `artifacts/corpus-triage/report.json`)
  - `TRIAGE_LIVE_FILE` (default `testdata/corpus-urls.live.txt`)
  - `TRIAGE_STALE_FILE` (default `testdata/corpus-urls.stale.txt`)
- Soak:
  - `SOAK_URL_FILE`
  - `SOAK_DURATION_SEC` (default `3600`)
  - `SOAK_INTERVAL_MS` (default `1500`)

Benchmark evidence is tracked in `docs/benchmark-summary.md`.

## Mandatory Submission Gate (No Exceptions)

Submission is blocked until all required gate artifacts are present and passing.

Canonical artifact location:
- `artifacts/submission/`

Required fixed filenames:
- `gate-status.json`
- `baseline-report.json`
- `corpus-report.json`
- `soak-report.json`
- `anti-fingerprint-rotation.json`
- `anti-ip-behavior.json`
- `anti-throttle-jitter.json`
- `public-smoke.json`
- `external-port-exposure.json`
- `secret-scan-report.json`
- `documentation-attestation.json`

Execution order is fail-fast and mandatory:
1. security
2. anti-detection
3. performance
4. documentation

Run the gate:

```powershell
npm run submission:check
```

Populate anti-detection evidence from runtime snapshot:

```powershell
npm run submission:capture-anti
```

Sync measured values and pass flags in `gate-status.json` from artifact files:

```powershell
npm run submission:sync-gates
```

Policy:
- No manual override.
- Any failed gate blocks submission.
- Only a fresh passing artifact set can unblock submission.

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
- If the upstream proxy returns `Auth_303` or `credential verification failed`, the proxy provider or credentials are the blocker, not the scraper.

### Local Proxy Adapter

If you need a local adapter in front of the upstream Korean proxy, run:

```powershell
$env:PROXY_SERVER='http://proxy.mrscraper.com:10000'
$env:PROXY_USERNAME='<your_proxy_username>'
$env:PROXY_PASSWORD='<your_proxy_password>'
npm run proxy:adapter
```

Then point the API at `http://127.0.0.1:8899` instead of the upstream proxy URL.

### Korea Proxy Integration

The scraper supports Korea Residential Proxy credentials via environment variables:

- `PROXY_SERVER=http://proxy.mrscraper.com:10000`
- `PROXY_USERNAME=<your_proxy_username>`
- `PROXY_PASSWORD=<your_proxy_password>`

## Additional Operator Docs

- `RUNBOOK-CDP-PROXY-CHECK.md`
- `docs/deployment/tencent-private-sidecar.md`
- `docs/benchmark-summary.md`
- `docs/security-secret-scan-checklist.md`
