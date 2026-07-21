import test from "node:test";
import assert from "node:assert/strict";
import { cdpInternalsForTest, type CaptureOptions } from "../../src/services/naver-cdp";

const captureOptions: CaptureOptions = {
  cdpUrl: "http://127.0.0.1:9222",
  navigationTimeoutMs: 8000,
  captureGraceMs: 4000,
  proxyServer: "http://127.0.0.1:8899",
  proxyUsername: "user-secret",
  proxyPassword: "pass-secret",
  cdpConnectRetries: 2,
  cdpRetryDelayMs: 250,
  blockedResourceTypes: ["image", "font", "media"],
  jitterMinMs: 150,
  jitterMaxMs: 900,
  fingerprintProfiles: [],
  ipSamplingEnabled: false,
  ipSampleMinIntervalMs: 60000
};

test("endpoint matcher recognizes product details and benefits URLs", () => {
  const detailsMatch = cdpInternalsForTest.matchProductDetailsUrl(
    "https://smartstore.naver.com/i/v2/channels/abc/products/123?withWindow=false"
  );
  assert.ok(detailsMatch);
  assert.equal(cdpInternalsForTest.isBenefitsUrl("https://smartstore.naver.com/benefits/by-product?x=1"), true);
});

test("error classification maps proxy auth and sidecar connection", () => {
  const proxyAuth = cdpInternalsForTest.classifyCaptureError("proxy authentication failed with 407");
  const sidecar = cdpInternalsForTest.classifyCaptureError("connectOverCDP: connect ECONNREFUSED");

  assert.equal(proxyAuth, "NAVER_PROXY_AUTH_FAILED");
  assert.equal(sidecar, "NAVER_SIDECAR_UNAVAILABLE");
});

test("redaction removes credential and endpoint secrets", () => {
  const raw =
    "failed http://127.0.0.1:8899 using user-secret:pass-secret and http://127.0.0.1:9222";
  const redacted = cdpInternalsForTest.redactSecrets(raw, captureOptions);

  assert.equal(redacted.includes("user-secret"), false);
  assert.equal(redacted.includes("pass-secret"), false);
  assert.equal(redacted.includes("127.0.0.1:9222"), false);
});
