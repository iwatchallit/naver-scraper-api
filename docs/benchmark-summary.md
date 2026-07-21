# Benchmark Summary

Status: preliminary harness evidence complete, full UAT dataset run pending evaluator execution.

## Completed Verification

- Unit tests: pass (`8/8`)
- Integration tests: pass (`4/4`)
- Harness scripts available:
  - `benchmark:baseline`
  - `benchmark:corpus`
  - `benchmark:soak`

## Baseline Outcome (100 mixed URLs)

- Harness support: implemented
- Output fields:
  - `total`
  - `success`
  - `failures`
  - `errorRatePct`
  - `latencyAvgMs`
- Result status: pending evaluator dataset execution

Run command:

```powershell
$env:BASELINE_URL_FILE="testdata/baseline-urls.txt"
$env:BASELINE_EXPECTED_COUNT="100"
npm run benchmark:baseline
```

## Corpus Outcome (1000 unique URLs)

- Harness support: implemented (hard check for at least 1000 unique URLs)
- Output fields:
  - `uniqueUrls`
  - `total`
  - `success`
  - `failures`
  - `errorRatePct`
  - `latencyAvgMs`
- Result status: pending evaluator dataset execution

Run command:

```powershell
$env:CORPUS_URL_FILE="testdata/corpus-urls.txt"
npm run benchmark:corpus
```

## Soak Outcome (1 hour)

- Harness support: implemented (default 3600 seconds)
- Output fields:
  - request summary (`total`, `success`, `failures`, `errorRatePct`, `latencyAvgMs`)
  - `readyFailures`
  - memory sample start/end/growth bytes from `/metrics`
- Result status: pending evaluator environment execution

Run command:

```powershell
$env:SOAK_URL_FILE="testdata/soak-urls.txt"
$env:SOAK_DURATION_SEC="3600"
$env:SOAK_INTERVAL_MS="1500"
npm run benchmark:soak
```

## Evidence Location

When executing benchmark jobs for submission, save JSON output under:

- `.tmp/benchmarks/baseline.json`
- `.tmp/benchmarks/corpus.json`
- `.tmp/benchmarks/soak.json`
