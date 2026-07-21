# 03 Add proxy adapter integration and sidecar reconnect safety

Status: completed

## What to build

Wire the local proxy adapter path used for Korean egress and add sidecar resilience controls so the API can recover from browser disconnects without leaking credentials. Include explicit error mapping for proxy and sidecar failure modes.

## Acceptance criteria

- [x] Browser traffic is routed through local proxy adapter settings from environment variables
- [x] Credentials are redacted from logs and never returned in API responses
- [x] Sidecar disconnect detection and reconnect attempts are implemented
- [x] Failure modes map to NAVER_SIDECAR_UNAVAILABLE, NAVER_PROXY_AUTH_FAILED, and NAVER_PROXY_UNAVAILABLE where applicable
- [x] Readiness endpoint reflects unhealthy dependency states

## Blocked by

- .scratch/naver-smartstore-scraper-api/issues/02-single-request-cdp-capture-benefits-product-details.md

## Comments

- 2026-07-21: Added optional proxy env wiring, secret redaction in capture errors, sidecar reconnect retries/disconnect tracking, and readiness degradation to 503 when sidecar dependency is unhealthy.
