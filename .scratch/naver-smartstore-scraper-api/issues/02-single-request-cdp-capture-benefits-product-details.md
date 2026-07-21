# 02 Single-request CDP capture for benefits and product details

Status: completed

## What to build

Implement one end-to-end capture path through the dedicated Chromium sidecar using Playwright connectOverCDP. For one validated product URL, attach response listeners before navigation and return separated raw payloads for both target upstream APIs.

## Acceptance criteria

- [x] Service connects to dedicated Chromium sidecar via CDP settings from environment variables
- [x] Response listeners are attached before page navigation begins
- [x] Captures and returns raw JSON for benefits-by-product endpoint with status and capture state
- [x] Captures and returns raw JSON for product-details endpoint with status, channelUid, and capture state
- [x] Product-details payload productId is verified against requested productId

## Blocked by

- .scratch/naver-smartstore-scraper-api/issues/01-bootstrap-api-shell-validation-observability.md

## Comments

- 2026-07-21: Implemented CDP capture service with response listeners before navigation, productId validation, and a fallback direct fetch for product-details when passive capture misses. Added timeout diagnostics to reduce blind 504 failures.
