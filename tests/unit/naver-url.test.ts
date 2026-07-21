import test from "node:test";
import assert from "node:assert/strict";
import { parseNaverProductUrl } from "../../src/domain/naver-url";

test("parseNaverProductUrl accepts valid smartstore URL", () => {
  const result = parseNaverProductUrl(
    "https://smartstore.naver.com/rainbows9030/products/11102379008"
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.storeName, "rainbows9030");
    assert.equal(result.value.productId, "11102379008");
  }
});

test("parseNaverProductUrl rejects invalid host", () => {
  const result = parseNaverProductUrl("https://example.com/a/products/1");

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "NAVER_INVALID_URL");
  }
});
