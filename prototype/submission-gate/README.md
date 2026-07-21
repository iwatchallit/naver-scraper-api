# Submission Gate Prototype

Visual prototype for the hard submission gate.

This follows the prototype UI skill: three radically different variants on one route, switchable with `?variant=`, plus a floating bottom switcher that updates the URL.

## What it shows

- Variant A: control-panel dashboard
- Variant B: risk timeline with detail rail
- Variant C: hybrid diagnosis plus compliance matrix
- Fail-fast order: security -> anti-detection -> performance -> documentation
- Canonical artifact bundle in `artifacts/submission/`

## How to view

Serve the repo root so the prototype can read the live `artifacts/submission/gate-status.json` snapshot.

Example:

```powershell
Set-Location d:/MrScrapper
python -m http.server 8080
```

Then open:

```text
http://127.0.0.1:8080/prototype/submission-gate/?variant=A
```

Variant keys:
- `A`
- `B`
- `C`
