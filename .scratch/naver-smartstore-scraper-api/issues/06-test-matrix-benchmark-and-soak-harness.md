# 06 Build test matrix, benchmark evidence, and soak harness

Status: completed

## What to build

Create executable validation coverage and performance evidence for the evaluator criteria. Include unit and integration tests plus reproducible baseline, corpus, and soak scripts or runners.

## Acceptance criteria

- [x] Unit coverage includes URL parsing, endpoint matching, error classification, cache behavior, queue behavior, and secret redaction
- [x] Integration coverage includes valid product, no benefits, sold out or removed product, invalid URL, proxy failure, and browser disconnect scenarios
- [x] Baseline run for 100 mixed URLs reports average latency and error rate
- [x] Corpus run supports at least 1000 unique product URLs with result summary output
- [x] One-hour soak run reports readiness stability and no unbounded memory growth signal

## Blocked by

- .scratch/naver-smartstore-scraper-api/issues/05-cache-metrics-and-latency-tuning.md

## Comments

- 2026-07-21: Added executable unit and integration tests with `node:test` + `tsx`, plus benchmark scripts for baseline/corpus and a one-hour soak harness. Added sample URL files and npm scripts: `test:unit`, `test:integration`, `benchmark:baseline`, `benchmark:corpus`, `benchmark:soak`.
- 2026-07-21: Verified test harness commands run and pass locally for unit and integration suites. Baseline/corpus/soak scripts are ready for UAT URL lists and duration runs.
