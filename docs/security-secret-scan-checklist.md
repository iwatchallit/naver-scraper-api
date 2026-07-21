# Secret Scan Checklist

Purpose: verify no credentials are committed to source, logs, or docs before evaluator submission.

## Checklist

- [x] `.env` is git-ignored
- [x] `.env.example` contains placeholders only
- [x] No proxy credential literals in `src/`
- [x] No credential-bearing URL patterns in docs
- [x] Error diagnostics redact proxy username/password
- [x] CDP endpoint and proxy values are treated as runtime configuration

## Commands

PowerShell examples:

```powershell
Set-Location d:/MrScrapper
rg -n "PROXY_PASSWORD|PROXY_USERNAME|AKIA|BEGIN PRIVATE KEY|ghp_" src docs tests scripts
rg -n "http[s]?://[^\s]*:[^\s]*@" src docs tests scripts
```

## Manual Review Notes

- Verify commit diff does not include `.env`.
- Verify logs shared externally do not contain tokens.
- Verify Tencent secret manager stores proxy credentials.

## Pass Criteria

- Scans return no real secrets.
- Any placeholder examples remain generic and non-sensitive.
