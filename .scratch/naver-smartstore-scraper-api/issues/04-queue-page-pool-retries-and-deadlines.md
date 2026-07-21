# 04 Introduce queue, page pool, retries, and deadline control

Status: completed

## What to build

Add bounded concurrency control around the capture flow with a small page worker pool, retry policy, and hard deadlines. This slice provides stable behavior under load and clear timeout error classification.

## Acceptance criteria

- [x] Bounded queue exists with configurable max depth (initial default 50)
- [x] Page pool starts with 2 worker pages and supports config-driven expansion
- [x] Navigation timeout, capture grace period, and global request deadline are enforced
- [x] Maximum attempt count is enforced at 2 attempts per request
- [x] Queue wait timeout and capture timeout map to NAVER_QUEUE_TIMEOUT and NAVER_CAPTURE_TIMEOUT

## Blocked by

- .scratch/naver-smartstore-scraper-api/issues/03-proxy-adapter-and-sidecar-reconnect-safety.md

## Comments

- 2026-07-21: Added request orchestrator with worker concurrency, bounded queue depth, queue wait timeout, global deadline, attempt retries, and runtime metadata (`attempts`, `queueWaitMs`) in API responses.
