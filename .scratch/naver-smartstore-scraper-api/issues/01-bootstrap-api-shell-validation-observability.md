# 01 Bootstrap API shell with strict URL validation and observability endpoints

Status: completed

## What to build

Create the initial Fastify service shell with one product route and core observability endpoints. The slice must parse and validate SmartStore product URLs using the required host and path schema, and expose service health surfaces needed by later slices.

## Acceptance criteria

- [x] API route GET /naver accepts productUrl query input and extracts storeName and productId when valid
- [x] Validation enforces host smartstore.naver.com and path /{store}/products/{numericId}
- [x] Invalid input returns a structured error using NAVER_INVALID_URL
- [x] Endpoints /health, /ready, and /metrics exist and return non-empty responses
- [x] Basic request metadata shape exists in responses (requestId, timestamp, latency fields)

## Blocked by

None - can start immediately

## Comments

- 2026-07-21: Implemented Fastify TypeScript service shell with strict URL validation and `/health`, `/ready`, `/metrics`, and `/naver` baseline route. Local compile and route smoke checks passed.
