# 06 Build test matrix, benchmark evidence, and soak harness

Status: ready-for-agent

## What to build

Create executable validation coverage and performance evidence for the evaluator criteria. Include unit and integration tests plus reproducible baseline, corpus, and soak scripts or runners.

## Acceptance criteria

- [ ] Unit coverage includes URL parsing, endpoint matching, error classification, cache behavior, queue behavior, and secret redaction
- [ ] Integration coverage includes valid product, no benefits, sold out or removed product, invalid URL, proxy failure, and browser disconnect scenarios
- [ ] Baseline run for 100 mixed URLs reports average latency and error rate
- [ ] Corpus run supports at least 1000 unique product URLs with result summary output
- [ ] One-hour soak run reports readiness stability and no unbounded memory growth signal

## Blocked by

- .scratch/naver-smartstore-scraper-api/issues/05-cache-metrics-and-latency-tuning.md

## Comments
