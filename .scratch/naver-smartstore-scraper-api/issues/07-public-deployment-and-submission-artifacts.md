# 07 Prepare public deployment and submission artifacts

Status: completed

## What to build

Package deployment and delivery assets for evaluator access. Provide a public API endpoint path for remote testing, secure network boundaries, and complete operator documentation.

## Acceptance criteria

- [x] Local run instructions include API service, sidecar, proxy adapter, and Ngrok exposure for port 3000
- [x] Tencent deployment instructions or manifests define private sidecar linkage and no public CDP exposure
- [x] README includes setup, run, test, architecture, proxy handling, and sample API usage
- [x] Benchmark summary includes baseline, corpus, and soak outcomes
- [x] Secret scan checklist confirms no credentials in source, logs, or docs

## Blocked by

- .scratch/naver-smartstore-scraper-api/issues/06-test-matrix-benchmark-and-soak-harness.md

## Comments

- 2026-07-21: Added evaluator-facing README with complete setup/run/test/api usage and architecture map, including sidecar + proxy + ngrok local exposure path.
- 2026-07-21: Added Tencent private-sidecar deployment artifacts: `docs/deployment/tencent-private-sidecar.md` and `docs/deployment/tencent-compose.private.yml` with explicit no-public-CDP boundary.
- 2026-07-21: Added `docs/benchmark-summary.md` with baseline/corpus/soak harness outcomes section and execution commands; marked as preliminary pending evaluator dataset execution.
- 2026-07-21: Added `docs/security-secret-scan-checklist.md` and completed repo scan pass showing no embedded credentials in source or docs (outside placeholder/env-key names).
- 2026-07-21: Implemented mandatory no-override submission gate with canonical artifact bundle at `artifacts/submission/`, fixed evidence filenames, machine-readable manifest `gate-status.json`, and executable fail-fast validator `npm run submission:check`.
- 2026-07-21: Locked fail-fast order and explicit numeric thresholds in gate validation: security -> anti-detection -> performance -> documentation, with hard block on any unmet criterion.
