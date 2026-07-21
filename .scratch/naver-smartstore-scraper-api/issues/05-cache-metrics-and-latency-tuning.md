# 05 Add cache, metrics, and latency tuning path

Status: completed

## What to build

Implement short-lived success caching, key runtime metrics, and baseline tuning hooks needed to approach the latency and reliability targets. Include visibility for queue and upstream timing.

## Acceptance criteria

- [x] Successful captures are cached with configurable TTL (initial default 60 seconds)
- [x] Cache hit and miss behavior is surfaced in response metadata
- [x] Metrics include queue wait, upstream duration, and end-to-end latency
- [x] Resource blocking or equivalent tuning guard is implemented for non-essential assets
- [x] Error and success counters are exposed for baseline tracking

## Blocked by

- .scratch/naver-smartstore-scraper-api/issues/04-queue-page-pool-retries-and-deadlines.md

## Comments

- 2026-07-21: Added success-cache with configurable TTL (`CACHE_TTL_MS`), `cache: hit|miss` metadata, queue/upstream/latency histograms, request/error counters, queue pending gauge, and non-essential resource blocking (`BLOCKED_RESOURCE_TYPES`) for capture performance tuning.
