import { ERROR_CODES, type ApiErrorShape } from "./errors";

const NAVER_HOST = "smartstore.naver.com";
const BRAND_HOST = "brand.naver.com";
const SHOPPING_HOST = "shopping.naver.com";
const PRODUCT_PATH_SEGMENT = "products";
const WINDOW_PRODUCTS_SEGMENT = "window-products";
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

  const host = parsedUrl.hostname;
  if (host !== NAVER_HOST && host !== BRAND_HOST && host !== SHOPPING_HOST) {
    return invalidUrl(`productUrl host must be one of ${NAVER_HOST}, ${BRAND_HOST}, or ${SHOPPING_HOST}`);
  }

  const segments = parsedUrl.pathname.split("/").filter(Boolean);
  const parsedPath = parseProductPath(host, segments);
  if (!parsedPath) {
    if (host === SHOPPING_HOST) {
      return invalidUrl("shopping.naver.com productUrl path must match /window-products/{store}/{numericId}");
    }

    return invalidUrl("productUrl path must match /{store}/products/{numericId}");
  }

  const { storeName, productId } = parsedPath;
  if (!NUMERIC_PRODUCT_ID.test(productId)) {
    return invalidUrl("productId in productUrl must be numeric");
  }

  return {
    ok: true,
    value: {
      sourceUrl: buildSourceUrl(host, storeName, productId),
      storeName,
      productId
    }
  };
}

function parseProductPath(
  host: string,
  segments: string[]
): { storeName: string; productId: string } | null {
  if (host === SHOPPING_HOST) {
    if (segments.length === 3 && segments[0] === WINDOW_PRODUCTS_SEGMENT) {
      return {
        storeName: segments[1],
        productId: segments[2]
      };
    }

    return null;
  }

  if (segments.length === 3 && segments[1] === PRODUCT_PATH_SEGMENT) {
    return {
      storeName: segments[0],
      productId: segments[2]
    };
  }

  return null;
}

function buildSourceUrl(host: string, storeName: string, productId: string): string {
  if (host === SHOPPING_HOST) {
    return `https://${SHOPPING_HOST}/${WINDOW_PRODUCTS_SEGMENT}/${storeName}/${productId}`;
  }

  return `https://${host}/${storeName}/${PRODUCT_PATH_SEGMENT}/${productId}`;
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
