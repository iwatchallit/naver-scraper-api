import test from "node:test";
import assert from "node:assert/strict";
import { getCachedCapture, setCachedCapture } from "../../src/services/capture-cache";

test("cache stores and returns successful capture payload", () => {
  const key = "https://smartstore.naver.com/store/products/1";

  setCachedCapture(key, {
    benefits: { state: "captured", status: 200, raw: { ok: true } },
    productDetails: {
      state: "captured",
      status: 200,
      channelUid: "channel",
      raw: { id: 1 }
    }
  });

  const cached = getCachedCapture(key);
  assert.ok(cached);
  assert.equal(cached?.productDetails.state, "captured");
});
