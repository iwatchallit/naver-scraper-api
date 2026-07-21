# CDP + Proxy Manual Runbook

Purpose: run one clean end-to-end check yourself, then send outputs back for quick diagnosis.

## 1) Build once

PowerShell:

Set-Location d:/MrScrapper
npm run build

Expected:
- Build completes without TypeScript errors.

## 2) Start Chrome CDP sidecar

PowerShell:

Start-Process -FilePath "C:\Program Files\Google\Chrome\Application\chrome.exe" -ArgumentList '--remote-debugging-port=9222','--user-data-dir=D:\MrScrapper\.tmp\chrome-cdp-profile','about:blank'

Optional port check:

Get-NetTCPConnection -State Listen -LocalPort 9222

Expected:
- A listening entry appears for local port 9222.

## 3) Prepare environment

Copy the template once:

Copy-Item .env.example .env -Force

Open .env and set values.

Minimal (no proxy):
- CDP_URL=http://127.0.0.1:9222
- Leave PROXY_SERVER, PROXY_USERNAME, PROXY_PASSWORD unset

With local proxy adapter:
- PROXY_SERVER=http://127.0.0.1:8899
- PROXY_USERNAME=your_username
- PROXY_PASSWORD=your_password

## 4) Start API

PowerShell:

npm run dev

Expected:
- Service starts on 127.0.0.1:3000 (or your HOST/PORT).

## 5) Readiness check

In a second terminal:

Invoke-RestMethod -Uri "http://127.0.0.1:3000/ready" -Method Get | ConvertTo-Json -Depth 8

Expected:
- status is ready if sidecar is healthy
- checks.proxyConfigured is false when proxy env is unset
- checks.proxyConfigured is true when PROXY_SERVER is set

## 6) Main endpoint check

PowerShell:

Invoke-RestMethod -Uri "http://127.0.0.1:3000/naver?productUrl=https://smartstore.naver.com/rainbows9030/products/11102379008" -Method Get | ConvertTo-Json -Depth 12

Success expected shape:
- success: true
- benefits.state: captured or absent
- productDetails.state: captured
- productDetails.channelUid: non-empty string

Known failure shapes:
- NAVER_SIDECAR_UNAVAILABLE: sidecar not reachable
- NAVER_PROXY_UNAVAILABLE: proxy configured but unreachable
- NAVER_PROXY_AUTH_FAILED: proxy auth rejected
- NAVER_CAPTURE_TIMEOUT: page loaded but target payload not captured in time

## 7) What to send back to me

Please paste these three outputs:
1. /ready JSON
2. /naver JSON
3. If failure: the error.code and full error.message

Also include whether you ran with:
- Proxy unset
- Proxy set to local adapter

## 8) Fast troubleshooting

If /ready says sidecar unhealthy:
- Restart Chrome sidecar command from step 2.
- Re-run /ready.

If /naver returns NAVER_SIDECAR_UNAVAILABLE:
- Confirm port 9222 is listening.
- Ensure CDP_URL is exactly http://127.0.0.1:9222.

If /naver returns NAVER_PROXY_UNAVAILABLE:
- Unset proxy vars and retry once (to isolate proxy path).
- If it works without proxy, proxy adapter path is the blocker.

If /naver returns NAVER_PROXY_AUTH_FAILED:
- Re-check PROXY_USERNAME and PROXY_PASSWORD values.

If /naver returns NAVER_CAPTURE_TIMEOUT:
- Retry once with another known-valid SmartStore URL.

## 9) Optional quick no-proxy test (single command)

PowerShell:

Remove-Item Env:PROXY_SERVER -ErrorAction SilentlyContinue
Remove-Item Env:PROXY_USERNAME -ErrorAction SilentlyContinue
Remove-Item Env:PROXY_PASSWORD -ErrorAction SilentlyContinue
Invoke-RestMethod -Uri "http://127.0.0.1:3000/naver?productUrl=https://smartstore.naver.com/rainbows9030/products/11102379008" -Method Get | ConvertTo-Json -Depth 12
