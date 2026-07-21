import { ERROR_CODES, type ApiErrorShape } from "./errors";

const NAVER_HOST = "smartstore.naver.com";
const PRODUCT_PATH_SEGMENT = "products";
const NUMERIC_PRODUCT_ID = /^\d+$/;

export interface NaverProductUrlInfo {
  sourceUrl: string;
  storeName: string;
  productId: string;
}

export type ParseNaverProductUrlResult =
  | { ok: true; value: NaverProductUrlInfo }
  | { ok: false; error: ApiErrorShape };

export function parseNaverProductUrl(input: string): ParseNaverProductUrlResult {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(input);
  } catch {
    return invalidUrl("productUrl must be a valid URL");
  }

  if (parsedUrl.hostname !== NAVER_HOST) {
    return invalidUrl(`productUrl host must be ${NAVER_HOST}`);
  }

  const segments = parsedUrl.pathname.split("/").filter(Boolean);
  if (segments.length !== 3 || segments[1] !== PRODUCT_PATH_SEGMENT) {
    return invalidUrl("productUrl path must match /{store}/products/{numericId}");
  }

  const [storeName, , productId] = segments;
  if (!NUMERIC_PRODUCT_ID.test(productId)) {
    return invalidUrl("productId in productUrl must be numeric");
  }

  return {
    ok: true,
    value: {
      sourceUrl: `https://${NAVER_HOST}/${storeName}/${PRODUCT_PATH_SEGMENT}/${productId}`,
      storeName,
      productId
    }
  };
}

function invalidUrl(message: string): ParseNaverProductUrlResult {
  return {
    ok: false,
    error: {
      code: ERROR_CODES.NAVER_INVALID_URL,
      message
    }
  };
}
