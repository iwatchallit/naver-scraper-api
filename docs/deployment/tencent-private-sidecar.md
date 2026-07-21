# Tencent Deployment: Private Sidecar Topology

This guide documents a Tencent-hosted deployment where only the API service is public and CDP remains private.

## Security Goal

- Public: API listener (`:3000`) behind HTTPS ingress
- Private only: CDP sidecar (`:9222`) on internal network
- Never expose CDP, proxy credentials, or `.env` content

## Recommended Topology

- `api` container:
  - Fastify service
  - Public ingress to `3000`
- `chrome-sidecar` container:
  - Chrome with `--remote-debugging-port=9222`
  - No external ingress
- Optional `proxy-adapter` container:
  - Internal network only

All services run in the same private VPC/subnet network.

## Runtime Environment

Set on API container:

- `HOST=0.0.0.0`
- `PORT=3000`
- `CDP_URL=http://chrome-sidecar:9222`
- Optional:
  - `PROXY_SERVER=http://proxy-adapter:8899`
  - `PROXY_USERNAME=<from secret manager>`
  - `PROXY_PASSWORD=<from secret manager>`

## Deployment Checklist

1. Build and push images for `api` and `chrome-sidecar`.
2. Attach both services to the same private network.
3. Route external HTTPS traffic only to API service.
4. Verify `/ready` returns sidecar healthy state.
5. Confirm network policy blocks any public route to sidecar port 9222.
6. Store proxy credentials in Tencent secret manager, not in repository files.

## Validation Commands

From within API runtime environment:

```bash
curl -sS http://127.0.0.1:3000/ready
curl -sS "http://127.0.0.1:3000/naver?productUrl=https://smartstore.naver.com/rainbows9030/products/11102379008"
```

From outside (public internet):

- API endpoint should be reachable.
- Any attempt to access sidecar host/port should fail.

## Reference Manifest

See `docs/deployment/tencent-compose.private.yml` for an example private-sidecar compose topology.
