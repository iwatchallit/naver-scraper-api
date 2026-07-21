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

test("parseNaverProductUrl accepts brand store URL", () => {
  const result = parseNaverProductUrl(
    "https://brand.naver.com/sonystore/products/9352594845?nl-query=%EB%AC%B4%EC%84%A0"
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.storeName, "sonystore");
    assert.equal(result.value.productId, "9352594845");
    assert.equal(result.value.sourceUrl, "https://brand.naver.com/sonystore/products/9352594845");
  }
});

test("parseNaverProductUrl accepts shopping window-products URL", () => {
  const result = parseNaverProductUrl(
    "https://shopping.naver.com/window-products/kurlynmart/12283206879?nl-query=%EC%B9%98%EC%95%BD"
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.storeName, "kurlynmart");
    assert.equal(result.value.productId, "12283206879");
    assert.equal(result.value.sourceUrl, "https://shopping.naver.com/window-products/kurlynmart/12283206879");
  }
});

test("parseNaverProductUrl rejects invalid host", () => {
  const result = parseNaverProductUrl("https://example.com/a/products/1");

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "NAVER_INVALID_URL");
  }
});
