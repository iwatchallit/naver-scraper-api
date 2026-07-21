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
- 2026-07-21: Added runtime anti-detection controls and telemetry for mandatory proof gates: rotating fingerprint profiles, randomized request jitter window, optional public IP sampling, and `/anti-detection` endpoint snapshot.
- 2026-07-21: Added submission automation scripts `submission:capture-anti` and `submission:sync-gates` to generate anti-detection artifact files and synchronize measured/pass states into `artifacts/submission/gate-status.json`.
- 2026-07-21: Validation run passed `build`, `test:unit`, and `test:integration`; `submission:check` correctly fails closed until real external/public evidence is populated.
- 2026-07-21: Added a visual prototype at `prototype/submission-gate/index.html` to show the hard gate, fail-fast order, canonical artifact bundle, and current blocked state at a glance.
- 2026-07-21: Aligned the visual prototype with the `prototype` skill UI branch: three variants (`?variant=A|B|C`), floating bottom switcher, keyboard navigation, URL persistence, and live load of `artifacts/submission/gate-status.json` when served from the repo root.
- 2026-07-21: Chosen layout direction for the prototype: left-to-right diagnosis and compliance matrix, implemented as a hybrid Variant C that puts the failing gate and next step above the audit table.
- 2026-07-21: Reworked the prototype visuals using the impeccable design system: night audit-desk palette, serif-led diagnosis headings, flatter section blocks, quieter labels, and stronger evidence typography.
- 2026-07-21: Added a local proxy adapter script and tested it against the trial upstream proxy. The adapter forwards plain HTTP correctly, but the upstream proxy returns `Auth_303` / credential verification failure, so the blocker is the proxy credentials/provider rather than the scraper wiring.
- 2026-07-21: Added `npm run proxy:smoke` so future proxy providers can be validated with a single command against a target URL before wiring the scraper stack.
