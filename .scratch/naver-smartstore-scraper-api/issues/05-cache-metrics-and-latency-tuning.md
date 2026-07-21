# 05 Add cache, metrics, and latency tuning path

Status: ready-for-agent

## What to build

Implement short-lived success caching, key runtime metrics, and baseline tuning hooks needed to approach the latency and reliability targets. Include visibility for queue and upstream timing.

## Acceptance criteria

- [ ] Successful captures are cached with configurable TTL (initial default 60 seconds)
- [ ] Cache hit and miss behavior is surfaced in response metadata
- [ ] Metrics include queue wait, upstream duration, and end-to-end latency
- [ ] Resource blocking or equivalent tuning guard is implemented for non-essential assets
- [ ] Error and success counters are exposed for baseline tracking

## Blocked by

- .scratch/naver-smartstore-scraper-api/issues/04-queue-page-pool-retries-and-deadlines.md

## Comments
