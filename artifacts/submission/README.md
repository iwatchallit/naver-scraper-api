# Submission Artifact Bundle

Canonical location for the no-override submission gate.

All required files must exist in this folder with exact names:

- `gate-status.json`
- `baseline-report.json`
- `corpus-report.json`
- `soak-report.json`
- `anti-fingerprint-rotation.json`
- `anti-ip-behavior.json`
- `anti-throttle-jitter.json`
- `public-smoke.json`
- `external-port-exposure.json`
- `secret-scan-report.json`
- `documentation-attestation.json`

Run gate check:

```powershell
npm run submission:check
```

Policy:

- No manual overrides.
- Any failed gate blocks submission.
- Only a fresh passing artifact set unblocks submission.
