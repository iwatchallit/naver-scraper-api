# 07 Prepare public deployment and submission artifacts

Status: ready-for-agent

## What to build

Package deployment and delivery assets for evaluator access. Provide a public API endpoint path for remote testing, secure network boundaries, and complete operator documentation.

## Acceptance criteria

- [ ] Local run instructions include API service, sidecar, proxy adapter, and Ngrok exposure for port 3000
- [ ] Tencent deployment instructions or manifests define private sidecar linkage and no public CDP exposure
- [ ] README includes setup, run, test, architecture, proxy handling, and sample API usage
- [ ] Benchmark summary includes baseline, corpus, and soak outcomes
- [ ] Secret scan checklist confirms no credentials in source, logs, or docs

## Blocked by

- .scratch/naver-smartstore-scraper-api/issues/06-test-matrix-benchmark-and-soak-harness.md

## Comments
