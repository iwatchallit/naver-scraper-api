import test from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../../src/app";
import { ERROR_CODES } from "../../src/domain/errors";

const validUrl = "https://smartstore.naver.com/rainbows9030/products/11102379008";

test("integration: invalid URL is rejected", async () => {
  const app = buildServer();
  const response = await app.inject({ method: "GET", url: "/naver?productUrl=https://example.com/x" });
  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 400);
  assert.equal(body.error.code, ERROR_CODES.NAVER_INVALID_URL);
  await app.close();
});

test("integration: sidecar unavailable scenario maps correctly", async () => {
  const app = buildServer({
    orchestrateCapture: async () => ({
      ok: false,
      error: {
        code: ERROR_CODES.NAVER_SIDECAR_UNAVAILABLE,
        message: "sidecar down"
      },
      meta: {
        attempts: 1,
        queueWaitMs: 5
      }
    }),
    getDependencyHealthSnapshot: () => ({
      sidecar: {
        state: "unhealthy",
        lastErrorAt: new Date().toISOString(),
        lastErrorCode: ERROR_CODES.NAVER_SIDECAR_UNAVAILABLE,
        lastErrorMessage: "sidecar down"
      },
      proxy: {
        configured: false,
        server: null
      }
    }),
    getQueueSnapshot: () => ({ workerPages: 2, maxQueueDepth: 50, pending: 0 })
  });

  const ready = await app.inject({ method: "GET", url: "/ready" });
  assert.equal(ready.statusCode, 503);

  const response = await app.inject({ method: "GET", url: `/naver?productUrl=${encodeURIComponent(validUrl)}` });
  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 503);
  assert.equal(body.error.code, ERROR_CODES.NAVER_SIDECAR_UNAVAILABLE);
  await app.close();
});

test("integration: proxy failure scenario maps correctly", async () => {
  const app = buildServer({
    orchestrateCapture: async () => ({
      ok: false,
      error: {
        code: ERROR_CODES.NAVER_PROXY_UNAVAILABLE,
        message: "proxy unavailable"
      },
      meta: {
        attempts: 1,
        queueWaitMs: 4
      }
    })
  });

  const response = await app.inject({ method: "GET", url: `/naver?productUrl=${encodeURIComponent(validUrl)}` });
  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 503);
  assert.equal(body.error.code, ERROR_CODES.NAVER_PROXY_UNAVAILABLE);
  await app.close();
});

test("integration: valid product, no benefits, sold out/removed modeled by orchestrator fixture", async () => {
  const app = buildServer({
    orchestrateCapture: async () => ({
      ok: true,
      value: {
        benefits: {
          state: "absent",
          status: 404
        },
        productDetails: {
          state: "captured",
          status: 200,
          channelUid: "channel-uid",
          raw: {
            id: "11102379008",
            soldOut: true
          }
        }
      },
      meta: {
        attempts: 1,
        queueWaitMs: 1
      }
    })
  });

  const response = await app.inject({ method: "GET", url: `/naver?productUrl=${encodeURIComponent(validUrl)}` });
  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(body.success, true);
  assert.equal(body.benefits.state, "absent");
  assert.equal(body.productDetails.state, "captured");
  assert.equal(body.productDetails.raw.soldOut, true);

  await app.close();
});
