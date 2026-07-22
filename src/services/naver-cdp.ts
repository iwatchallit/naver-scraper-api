import { existsSync } from "node:fs";
import { chromium, type Browser, type BrowserContext, type Page, type Response } from "playwright-core";
import { createEmptyCaptureResult, type NaverCaptureResult } from "../domain/capture";
import { ERROR_CODES, type ApiErrorShape } from "../domain/errors";
import type { NaverProductUrlInfo } from "../domain/naver-url";

const SMARTSTORE_PRODUCT_DETAILS_REGEX = /\/i\/v2\/channels\/([^/]+)\/products\/(\d+)(?:\?|$)/;
const BRAND_PRODUCT_DETAILS_REGEX = /\/n\/v2\/channels\/([^/]+)\/products\/(\d+)(?:\?|$)/;
const SHOPPING_PRODUCT_DETAILS_REGEX = /\/product-detail\/v2\/channels\/([^/]+)\/products\/(\d+)(?:\?|$)/;
const BRAND_PRODUCT_CONTENT_REGEX = /\/n\/v2\/channels\/([^/]+)\/products\/(\d+)\/contents\/(\d+)\/PC(?:\?|$)/;
const SHOPPING_PRODUCT_CONTENT_REGEX = /\/product-detail\/v2\/channels\/([^/]+)\/products\/(\d+)\/contents\/(\d+)\/PC(?:\?|$)/;
const SMARTSTORE_BENEFITS_REGEX = /\/benefits\/by-product(?:s)?(?:\/(\d+))?(?:\?|$)/;
const BRAND_BENEFITS_REGEX = /\/n\/v2\/channels\/([^/]+)\/product-benefits(?:\/(\d+))?(?:\?|$)/;
const SHOPPING_BENEFITS_REGEX = /\/product-detail\/v2\/channels\/([^/]+)\/product-benefits(?:\/(\d+))?(?:\?|$)/;
const CHANNEL_UID_IN_HTML_REGEX = /"channelUid"\s*:\s*"([^"]+)"/;

let sidecarBrowser: Browser | null = null;

type SidecarState = "unknown" | "healthy" | "unhealthy";

interface DependencyHealthState {
  sidecar: {
    state: SidecarState;
    lastErrorAt: string | null;
    lastErrorCode: string | null;
    lastErrorMessage: string | null;
  };
  proxy: {
    configured: boolean;
    server: string | null;
  };
}

interface FingerprintProfile {
  id: string;
  userAgent: string;
  locale: string;
  timezoneId: string;
  viewport: {
    width: number;
    height: number;
  };
  colorScheme: "light" | "dark";
}

export interface AntiDetectionSnapshot {
  requestsObserved: number;
  distinctProfiles: number;
  profileUsage: Array<{
    profileId: string;
    count: number;
  }>;
  jitter: {
    configuredMinMs: number;
    configuredMaxMs: number;
    observedMinMs: number;
    observedMaxMs: number;
    violations: number;
  };
  ipBehavior: {
    samples: string[];
    uniqueIps: number;
    rotationObserved: number;
    samplingEnabled: boolean;
  };
}

const dependencyHealth: DependencyHealthState = {
  sidecar: {
    state: "unknown",
    lastErrorAt: null,
    lastErrorCode: null,
    lastErrorMessage: null
  },
  proxy: {
    configured: false,
    server: null
  }
};

export interface CaptureOptions {
  navigationTimeoutMs: number;
  captureGraceMs: number;
  cdpUrl: string;
  proxyServer: string | null;
  proxyUsername: string | null;
  proxyPassword: string | null;
  cdpConnectRetries: number;
  cdpRetryDelayMs: number;
  blockedResourceTypes: string[];
  jitterMinMs: number;
  jitterMaxMs: number;
  fingerprintProfiles: FingerprintProfile[];
  ipSamplingEnabled: boolean;
  ipSampleMinIntervalMs: number;
  storageStatePath: string | null;
  takeScreenshot?: boolean;
}

export interface CaptureSuccess {
  ok: true;
  value: NaverCaptureResult;
  screenshotBase64?: string;
}

export interface CaptureFailure {
  ok: false;
  error: ApiErrorShape;
  screenshotBase64?: string;
}

export type CaptureAttemptResult = CaptureSuccess | CaptureFailure;

const DEFAULT_FINGERPRINT_PROFILES: FingerprintProfile[] = [
  {
    id: "chrome-win-kr-1",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    viewport: { width: 1366, height: 768 },
    colorScheme: "light"
  },
  {
    id: "chrome-win-kr-2",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    viewport: { width: 1536, height: 864 },
    colorScheme: "light"
  },
  {
    id: "chrome-mac-kr-1",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    viewport: { width: 1440, height: 900 },
    colorScheme: "light"
  }
];

const antiDetectionState = {
  requestsObserved: 0,
  profileUsage: new Map<string, number>(),
  jitterObservedMinMs: Number.POSITIVE_INFINITY,
  jitterObservedMaxMs: 0,
  jitterViolations: 0,
  ipSamples: [] as string[],
  lastIpSampleAtMs: 0,
  profileRotationIndex: 0
};

export function getCaptureOptionsFromEnv(): CaptureOptions {
  const proxyServer = normalizeOptionalString(process.env.PROXY_SERVER);
  const proxyUsername = normalizeOptionalString(process.env.PROXY_USERNAME);
  const proxyPassword = normalizeOptionalString(process.env.PROXY_PASSWORD);

  return {
    cdpUrl: process.env.CDP_URL ?? "http://127.0.0.1:9222",
    navigationTimeoutMs: toPositiveInt(process.env.NAVIGATION_TIMEOUT_MS, 16000),
    captureGraceMs: toPositiveInt(process.env.CAPTURE_GRACE_MS, 16000),
    proxyServer,
    proxyUsername,
    proxyPassword,
    cdpConnectRetries: toPositiveInt(process.env.CDP_CONNECT_RETRIES, 2),
    cdpRetryDelayMs: toPositiveInt(process.env.CDP_RETRY_DELAY_MS, 250),
    blockedResourceTypes: getBlockedResourceTypesFromEnv(),
    jitterMinMs: toNonNegativeInt(process.env.REQUEST_JITTER_MIN_MS, 150),
    jitterMaxMs: toNonNegativeInt(process.env.REQUEST_JITTER_MAX_MS, 900),
    fingerprintProfiles: getFingerprintProfilesFromEnv(),
    ipSamplingEnabled: (process.env.IP_SAMPLING_ENABLED ?? "false").toLowerCase() === "true",
    ipSampleMinIntervalMs: toPositiveInt(process.env.IP_SAMPLE_MIN_INTERVAL_MS, 60000),
    storageStatePath: normalizeOptionalString(process.env.NAVER_STORAGE_STATE_PATH)
  };
}

export function getAntiDetectionSnapshot(options?: CaptureOptions): AntiDetectionSnapshot {
  const resolvedOptions = options ?? getCaptureOptionsFromEnv();

  const observedMin =
    antiDetectionState.jitterObservedMinMs === Number.POSITIVE_INFINITY
      ? 0
      : antiDetectionState.jitterObservedMinMs;

  const uniqueIps = new Set(antiDetectionState.ipSamples);

  return {
    requestsObserved: antiDetectionState.requestsObserved,
    distinctProfiles: antiDetectionState.profileUsage.size,
    profileUsage: Array.from(antiDetectionState.profileUsage.entries())
      .map(([profileId, count]) => ({ profileId, count }))
      .sort((left, right) => right.count - left.count),
    jitter: {
      configuredMinMs: resolvedOptions.jitterMinMs,
      configuredMaxMs: resolvedOptions.jitterMaxMs,
      observedMinMs: observedMin,
      observedMaxMs: antiDetectionState.jitterObservedMaxMs,
      violations: antiDetectionState.jitterViolations
    },
    ipBehavior: {
      samples: [...antiDetectionState.ipSamples],
      uniqueIps: uniqueIps.size,
      rotationObserved: Math.max(0, uniqueIps.size - 1),
      samplingEnabled: resolvedOptions.ipSamplingEnabled
    }
  };
}

export function getDependencyHealthSnapshot() {
  const proxyServer = normalizeOptionalString(process.env.PROXY_SERVER);
  dependencyHealth.proxy.server = proxyServer;
  dependencyHealth.proxy.configured = Boolean(proxyServer);

  return {
    sidecar: { ...dependencyHealth.sidecar },
    proxy: { ...dependencyHealth.proxy }
  };
}

export async function captureProductPayloads(
  productUrl: NaverProductUrlInfo,
  options: CaptureOptions
): Promise<CaptureAttemptResult> {
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  let isReusedContext = false;

  try {
    const fingerprintProfile = selectFingerprintProfile(options.fingerprintProfiles);
    const browser = await getOrCreateBrowser(options);
    
    if (!options.proxyServer && browser.contexts().length > 0) {
      context = browser.contexts()[0];
      isReusedContext = true;
    } else {
      const storageState = getAvailableStorageStatePath(options.storageStatePath);
      context = await browser.newContext({
        proxy: options.proxyServer ? {
          server: options.proxyServer,
          username: options.proxyUsername ?? undefined,
          password: options.proxyPassword ?? undefined
        } : undefined,
        storageState: storageState ?? undefined,
        userAgent: fingerprintProfile.userAgent,
        locale: fingerprintProfile.locale,
        timezoneId: fingerprintProfile.timezoneId,
        viewport: fingerprintProfile.viewport,
        colorScheme: fingerprintProfile.colorScheme
      });
    }

    page = await context.newPage();
    await page.bringToFront().catch(() => undefined);

    await applyRequestJitter(options);
    noteFingerprintUsage(fingerprintProfile.id);
    await maybeSamplePublicIp(context, options);

    await applyResourceBlocking(page, options.blockedResourceTypes);

    const capture = createEmptyCaptureResult();
    const diagnostics = createCaptureDiagnostics();
    attachResponseCapture(page, productUrl, capture, diagnostics);

    await page.goto(productUrl.sourceUrl, {
      waitUntil: "domcontentloaded",
      timeout: options.navigationTimeoutMs
    });

    await sleep(1000);

    await Promise.all([
      waitForCapture(capture, options.captureGraceMs),
      simulateHumanInteraction(page, capture, options.captureGraceMs)
    ]);

    const bodyText = await page.textContent("body").catch(() => "");
    const noticeAfterCaptureWait = detectUpstreamPageNoticeText(bodyText ?? "");
    if (noticeAfterCaptureWait) {
      const screenshotBase64 = await safeCaptureScreenshot(page);
      return {
        ok: false,
        error: {
          code: noticeAfterCaptureWait.code,
          message: noticeAfterCaptureWait.message
        },
        screenshotBase64
      };
    }

    if (capture.productDetails.state !== "captured") {
      await fallbackFetchProductDetails(page, productUrl, capture, diagnostics, options);
    }

    if (capture.productDetails.state !== "captured") {
      await captureProductDetailsFromPageState(page, productUrl, capture, diagnostics);
    }

    if (capture.benefits.state === "not-captured") {
      capture.benefits.state = "absent";
    }

    if (capture.productDetails.state !== "captured") {
      const screenshotBase64 = await safeCaptureScreenshot(page);
      if (capture.productDetails.state === "invalid-json") {
        return {
          ok: false,
          error: {
            code: ERROR_CODES.NAVER_INVALID_UPSTREAM_JSON,
            message: "Product details endpoint returned non-JSON content"
          },
          screenshotBase64
        };
      }

      return {
        ok: false,
        error: {
          code: ERROR_CODES.NAVER_CAPTURE_TIMEOUT,
          message: buildCaptureTimeoutMessage(diagnostics)
        },
        screenshotBase64
      };
    }

    const finalScreenshot = options.takeScreenshot ? await safeCaptureScreenshot(page) : undefined;
    
    return {
      ok: true,
      value: capture,
      screenshotBase64: finalScreenshot
    };
  } catch (error) {
    invalidateSidecarConnection();

    const rawMessage = error instanceof Error ? error.message : "Unknown CDP error";
    const code = classifyCaptureError(rawMessage);
    const message = redactSecrets(rawMessage, options);

    recordSidecarFailure(code, message);
    
    const screenshotBase64 = page ? await safeCaptureScreenshot(page) : undefined;

    return {
      ok: false,
      error: {
        code,
        message: `Failed to capture through CDP sidecar: ${message}`
      },
      screenshotBase64
    };
  } finally {
    await page?.close({ runBeforeUnload: false }).catch(() => undefined);
    if (context && !isReusedContext) {
      await context?.close().catch(() => undefined);
    }
  }
}

async function safeCaptureScreenshot(page: Page): Promise<string | undefined> {
  try {
    const buffer = await page.screenshot({ type: "jpeg", quality: 50, timeout: 2000 });
    return buffer.toString("base64");
  } catch {
    return undefined;
  }
}

interface CaptureDiagnostics {
  observedProductDetailsUrls: string[];
  observedChannelUid: string | null;
  observedBrandContentUrl: string | null;
  observedShoppingContentUrl: string | null;
  fallbackFetchAttempted: boolean;
  fallbackFetchStatus: number | null;
  pageStateAttempted: boolean;
  pageStateMarkerFound: boolean;
  pageStateParsed: boolean;
  pageStateHasProductDetail: boolean;
  pageStateProductId: string | null;
  pageStateChannelUid: string | null;
  pageStateMatchedTargetProduct: boolean;
  pageStateCaptured: boolean;
  pageStateError: string | null;
}

function createCaptureDiagnostics(): CaptureDiagnostics {
  return {
    observedProductDetailsUrls: [],
    observedChannelUid: null,
    observedBrandContentUrl: null,
    observedShoppingContentUrl: null,
    fallbackFetchAttempted: false,
    fallbackFetchStatus: null,
    pageStateAttempted: false,
    pageStateMarkerFound: false,
    pageStateParsed: false,
    pageStateHasProductDetail: false,
    pageStateProductId: null,
    pageStateChannelUid: null,
    pageStateMatchedTargetProduct: false,
    pageStateCaptured: false,
    pageStateError: null
  };
}

function attachResponseCapture(
  page: Page,
  productUrl: NaverProductUrlInfo,
  capture: NaverCaptureResult,
  diagnostics: CaptureDiagnostics
) {
  page.on("response", async (response) => {
    const url = response.url();

    if (isBenefitsUrl(url) && capture.benefits.state === "not-captured") {
      await captureBenefitsResponse(response, capture);
      return;
    }

    if (capture.productDetails.state !== "captured") {
      const detailsMatch = matchProductDetailsUrl(url);
      if (!detailsMatch) {
        const brandContentMatch = matchBrandProductContentUrl(url);
        if (!brandContentMatch) {
          const shoppingContentMatch = matchShoppingProductContentUrl(url);
          if (!shoppingContentMatch) {
            return;
          }

          pushObservedProductDetailsUrl(diagnostics, url);

          const [, channelUid, productId] = shoppingContentMatch;
          diagnostics.observedChannelUid = channelUid;
          diagnostics.observedShoppingContentUrl = url;

          if (productId !== productUrl.productId) {
            return;
          }

          await captureProductDetailsResponse(response, capture, channelUid);
          return;
        }

        pushObservedProductDetailsUrl(diagnostics, url);

        const [, channelUid, productId] = brandContentMatch;
        diagnostics.observedChannelUid = channelUid;
        diagnostics.observedBrandContentUrl = url;

        if (productId !== productUrl.productId) {
          return;
        }

        await captureProductDetailsResponse(response, capture, channelUid);
        return;
      }

      pushObservedProductDetailsUrl(diagnostics, url);

      const [, channelUid, productId] = detailsMatch;
      diagnostics.observedChannelUid = channelUid;

      if (productId !== productUrl.productId) {
        return;
      }

      await captureProductDetailsResponse(response, capture, channelUid);
    }
  });
}

async function fallbackFetchProductDetails(
  page: Page,
  productUrl: NaverProductUrlInfo,
  capture: NaverCaptureResult,
  diagnostics: CaptureDiagnostics,
  options: CaptureOptions
) {
  diagnostics.fallbackFetchAttempted = true;

  const channelUid =
    diagnostics.observedChannelUid ?? (await extractChannelUidFromPage(page)).channelUid ?? null;

  if (!channelUid) {
    return;
  }

  const detailsUrl = buildFallbackDetailsUrl(productUrl, channelUid, diagnostics.observedBrandContentUrl);

  try {
    const response = await page.request.get(detailsUrl, {
      timeout: options.navigationTimeoutMs,
      headers: {
        accept: "application/json, text/plain, */*"
      }
    });

    diagnostics.fallbackFetchStatus = response.status();
    capture.productDetails.status = response.status();
    capture.productDetails.channelUid = channelUid;

    const text = await response.text();
    try {
      const raw = JSON.parse(text);
      capture.productDetails = {
        state: "captured",
        status: response.status(),
        channelUid,
        raw
      };
    } catch {
      capture.productDetails.state = "invalid-json";
    }
  } catch {
    // Ignore fallback fetch failures; timeout handling continues upstream.
  }
}

async function captureProductDetailsFromPageState(
  page: Page,
  productUrl: NaverProductUrlInfo,
  capture: NaverCaptureResult,
  diagnostics: CaptureDiagnostics
) {
  diagnostics.pageStateAttempted = true;

  try {
    const html = await page.content();
    diagnostics.pageStateMarkerFound = html.includes("window.__PRELOADED_STATE__=");

    const state = extractPreloadedStateFromHtml(html);
    diagnostics.pageStateParsed = state !== null;

    const productDetail =
      state && typeof state === "object" ? (state as { productDetail?: unknown }).productDetail : extractProductDetailFromHtml(html);

    diagnostics.pageStateHasProductDetail = Boolean(productDetail && typeof productDetail === "object");

    if (!productDetail || typeof productDetail !== "object") {
      return;
    }

    const normalizedProductDetail = productDetail as {
      _id?: unknown;
      productNo?: unknown;
      channel?: { channelUid?: unknown };
    };
    const pageProductId = normalizePageStateProductId(normalizedProductDetail._id ?? normalizedProductDetail.productNo);
    diagnostics.pageStateProductId = pageProductId;

    if (pageProductId !== productUrl.productId) {
      diagnostics.pageStateMatchedTargetProduct = false;
      return;
    }

    diagnostics.pageStateMatchedTargetProduct = true;

    const channelUid = normalizePageStateProductId(normalizedProductDetail.channel?.channelUid);
    diagnostics.pageStateChannelUid = channelUid;

    if (!channelUid) {
      return;
    }

    capture.productDetails = {
      state: "captured",
      status: 200,
      channelUid,
      raw: productDetail
    };
    diagnostics.pageStateCaptured = true;
  } catch {
    diagnostics.pageStateError = "page-state-capture-threw";
    // Page-state capture is best-effort and only used when network capture misses.
  }
}

async function extractChannelUidFromPage(page: Page): Promise<{ channelUid: string | null }> {
  try {
    const html = await page.content();
    const match = html.match(CHANNEL_UID_IN_HTML_REGEX);
    if (match && match[1]) {
      return { channelUid: match[1] };
    }
  } catch {
    return { channelUid: null };
  }

  return { channelUid: null };
}

function pushObservedProductDetailsUrl(diagnostics: CaptureDiagnostics, url: string) {
  if (diagnostics.observedProductDetailsUrls.length >= 5) {
    return;
  }

  diagnostics.observedProductDetailsUrls.push(url);
}

function buildCaptureTimeoutMessage(diagnostics: CaptureDiagnostics): string {
  const fallbackSummary = diagnostics.fallbackFetchAttempted
    ? `fallbackFetch(status=${diagnostics.fallbackFetchStatus ?? "none"})`
    : "fallbackFetch(not-attempted)";

  const pageStateSummary = diagnostics.pageStateAttempted
    ? `pageState(marker=${diagnostics.pageStateMarkerFound}, parsed=${diagnostics.pageStateParsed}, productDetail=${diagnostics.pageStateHasProductDetail}, productId=${diagnostics.pageStateProductId ?? "none"}, targetMatch=${diagnostics.pageStateMatchedTargetProduct}, channelUid=${diagnostics.pageStateChannelUid ?? "none"}, captured=${diagnostics.pageStateCaptured}${diagnostics.pageStateError ? `, error=${diagnostics.pageStateError}` : ""})`
    : "pageState(not-attempted)";

  if (diagnostics.observedProductDetailsUrls.length === 0) {
    return `Could not capture product details payload within timeout; no matching product-details responses were observed; ${fallbackSummary}; ${pageStateSummary}`;
  }

  return `Could not capture product details payload within timeout; observed candidates: ${diagnostics.observedProductDetailsUrls.join(" | ")}; ${fallbackSummary}; ${pageStateSummary}`;
}

interface UpstreamPageNotice {
  code: ApiErrorShape["code"];
  message: string;
}

function detectUpstreamPageNoticeText(bodyText: string): UpstreamPageNotice | null {
  const normalized = bodyText.toLowerCase();

  if (
    normalized.includes("please complete the security verification") ||
    normalized.includes("security verification") ||
    normalized.includes("this procedure will help you secure your account") ||
    normalized.includes("audio guide will play") ||
    normalized.includes("음성으로 안내되고 있습니다")
  ) {
    return {
      code: ERROR_CODES.NAVER_UPSTREAM_CHALLENGE,
      message: "Upstream security verification page detected instead of the product page"
    };
  }

  if (
    normalized.includes("operations have been suspended due to the seller's circumstances") ||
    normalized.includes("판매자의 사정에 따라 운영이 중지되었습니다") ||
    normalized.includes("현재 서비스 접속이 불가합니다") ||
    normalized.includes("service access is currently unavailable")
  ) {
    return {
      code: ERROR_CODES.NAVER_TARGET_UNAVAILABLE,
      message: "Target page is temporarily unavailable or seller operations are suspended"
    };
  }

  return null;
}

async function captureBenefitsResponse(response: Response, capture: NaverCaptureResult) {
  capture.benefits.status = response.status();

  try {
    const raw = await response.json();
    capture.benefits = {
      state: "captured",
      status: response.status(),
      raw
    };
  } catch {
    capture.benefits.state = "invalid-json";
    capture.benefits.status = response.status();
  }
}

async function captureProductDetailsResponse(
  response: Response,
  capture: NaverCaptureResult,
  channelUid: string
) {
  capture.productDetails.status = response.status();
  capture.productDetails.channelUid = channelUid;

  try {
    const raw = await response.json();
    capture.productDetails = {
      state: "captured",
      status: response.status(),
      channelUid,
      raw
    };
  } catch {
    capture.productDetails.state = "invalid-json";
    capture.productDetails.status = response.status();
  }
}

function isBenefitsUrl(url: string): boolean {
  return SMARTSTORE_BENEFITS_REGEX.test(url) || BRAND_BENEFITS_REGEX.test(url) || SHOPPING_BENEFITS_REGEX.test(url);
}

function matchProductDetailsUrl(url: string): RegExpMatchArray | null {
  return (
    url.match(SMARTSTORE_PRODUCT_DETAILS_REGEX) ??
    url.match(BRAND_PRODUCT_DETAILS_REGEX) ??
    url.match(SHOPPING_PRODUCT_DETAILS_REGEX)
  );
}

function matchBrandProductContentUrl(url: string): RegExpMatchArray | null {
  return url.match(BRAND_PRODUCT_CONTENT_REGEX);
}

function matchShoppingProductContentUrl(url: string): RegExpMatchArray | null {
  return url.match(SHOPPING_PRODUCT_CONTENT_REGEX);
}

function buildFallbackDetailsUrl(
  productUrl: NaverProductUrlInfo,
  channelUid: string,
  observedBrandContentUrl: string | null
): string {
  if (isBrandUrl(productUrl.sourceUrl) && observedBrandContentUrl) {
    return observedBrandContentUrl;
  }

  if (isShoppingWindowUrl(productUrl.sourceUrl) && observedBrandContentUrl) {
    return observedBrandContentUrl;
  }

  if (isShoppingWindowUrl(productUrl.sourceUrl) && observedBrandContentUrl === null) {
    return `https://shopping.naver.com/product-detail/v2/channels/${channelUid}/products/${productUrl.productId}?withWindow=false`;
  }

  if (isBrandUrl(productUrl.sourceUrl)) {
    return `https://brand.naver.com/n/v2/channels/${channelUid}/products/${productUrl.productId}?withWindow=false`;
  }

  return `https://smartstore.naver.com/i/v2/channels/${channelUid}/products/${productUrl.productId}?withWindow=false`;
}

function isBrandUrl(url: string): boolean {
  return url.includes("brand.naver.com");
}

function isShoppingWindowUrl(url: string): boolean {
  return url.includes("shopping.naver.com/window-products/");
}

async function getOrCreateBrowser(options: CaptureOptions): Promise<Browser> {
  if (sidecarBrowser?.isConnected()) {
    markSidecarHealthy();
    return sidecarBrowser;
  }

  let attempt = 0;
  let lastError: unknown = null;

  while (attempt < options.cdpConnectRetries) {
    attempt += 1;

    try {
      sidecarBrowser = await chromium.connectOverCDP(options.cdpUrl);
      sidecarBrowser.on("disconnected", () => {
        sidecarBrowser = null;
        recordSidecarFailure(ERROR_CODES.NAVER_SIDECAR_UNAVAILABLE, "CDP sidecar disconnected");
      });

      markSidecarHealthy();
      return sidecarBrowser;
    } catch (error) {
      lastError = error;

      if (attempt < options.cdpConnectRetries) {
        await sleep(options.cdpRetryDelayMs);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unknown CDP connection failure");
}

function invalidateSidecarConnection() {
  sidecarBrowser?.removeAllListeners("disconnected");
  sidecarBrowser = null;
}

async function waitForCapture(capture: NaverCaptureResult, captureGraceMs: number): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < captureGraceMs) {
    if (capture.productDetails.state === "captured" && capture.benefits.state === "captured") {
      return;
    }

    await sleep(50);
  }
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

async function simulateHumanInteraction(page: Page, capture: NaverCaptureResult, graceMs: number): Promise<void> {
  const startedAt = Date.now();
  try {
    while (Date.now() - startedAt < graceMs) {
      if (capture.productDetails.state === "captured" && capture.benefits.state === "captured") {
        return;
      }

      const x = Math.floor(Math.random() * 800) + 100;
      const y = Math.floor(Math.random() * 600) + 100;
      await page.mouse.move(x, y, { steps: 5 }).catch(() => undefined);
      
      if (Math.random() > 0.7) {
        await page.mouse.wheel(0, Math.floor(Math.random() * 300) - 100).catch(() => undefined);
      }
      
      await sleep(Math.floor(Math.random() * 500) + 200);
    }
  } catch {
    // Ignore errors if page closes
  }
}

function selectFingerprintProfile(profiles: FingerprintProfile[]): FingerprintProfile {
  if (profiles.length === 0) {
    return DEFAULT_FINGERPRINT_PROFILES[0];
  }

  const index = antiDetectionState.profileRotationIndex % profiles.length;
  antiDetectionState.profileRotationIndex += 1;
  return profiles[index];
}

function noteFingerprintUsage(profileId: string) {
  antiDetectionState.requestsObserved += 1;
  const current = antiDetectionState.profileUsage.get(profileId) ?? 0;
  antiDetectionState.profileUsage.set(profileId, current + 1);
}

async function applyRequestJitter(options: CaptureOptions) {
  const normalizedMin = Math.min(options.jitterMinMs, options.jitterMaxMs);
  const normalizedMax = Math.max(options.jitterMinMs, options.jitterMaxMs);
  const jitter = randomIntInclusive(normalizedMin, normalizedMax);

  antiDetectionState.jitterObservedMinMs = Math.min(antiDetectionState.jitterObservedMinMs, jitter);
  antiDetectionState.jitterObservedMaxMs = Math.max(antiDetectionState.jitterObservedMaxMs, jitter);

  if (jitter < normalizedMin || jitter > normalizedMax) {
    antiDetectionState.jitterViolations += 1;
  }

  await sleep(jitter);
}

async function maybeSamplePublicIp(context: BrowserContext, options: CaptureOptions) {
  if (!options.ipSamplingEnabled) {
    return;
  }

  const now = Date.now();
  const elapsed = now - antiDetectionState.lastIpSampleAtMs;
  if (elapsed < options.ipSampleMinIntervalMs) {
    return;
  }

  antiDetectionState.lastIpSampleAtMs = now;

  try {
    const response = await context.request.get("https://api.ipify.org?format=json", {
      timeout: 5000,
      headers: {
        accept: "application/json"
      }
    });

    const payload = (await response.json()) as { ip?: string };
    const ip = normalizeOptionalString(payload.ip);
    if (!ip) {
      return;
    }

    if (antiDetectionState.ipSamples.length >= 40) {
      antiDetectionState.ipSamples.shift();
    }

    antiDetectionState.ipSamples.push(ip);
  } catch {
    // IP sampling is best-effort evidence and must not break capture flow.
  }
}

function toPositiveInt(rawValue: string | undefined, fallback: number): number {
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function toNonNegativeInt(rawValue: string | undefined, fallback: number): number {
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

function normalizeOptionalString(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePageStateProductId(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  return null;
}

function extractPreloadedStateFromHtml(html: string): Record<string, unknown> | null {
  const marker = "window.__PRELOADED_STATE__=";
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) {
    return null;
  }

  const startIndex = html.indexOf("{", markerIndex + marker.length);
  if (startIndex < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < html.length; index += 1) {
    const char = html[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        const rawJson = html.slice(startIndex, index + 1);

        try {
          return JSON.parse(rawJson) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

function extractProductDetailFromHtml(html: string): Record<string, unknown> | null {
  const marker = '"productDetail":';
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) {
    return null;
  }

  const startIndex = html.indexOf("{", markerIndex + marker.length);
  if (startIndex < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < html.length; index += 1) {
    const char = html[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        const rawJson = html.slice(startIndex, index + 1);

        try {
          return JSON.parse(rawJson) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

function classifyCaptureError(message: string): ApiErrorShape["code"] {
  const lower = message.toLowerCase();

  if (lower.includes("407") || lower.includes("proxy authentication")) {
    return ERROR_CODES.NAVER_PROXY_AUTH_FAILED;
  }

  if (
    lower.includes("auth_303") ||
    lower.includes("credential verification failed") ||
    lower.includes("credential parameter error")
  ) {
    return ERROR_CODES.NAVER_PROXY_AUTH_FAILED;
  }

  if (
    lower.includes("proxy") ||
    lower.includes("tunnel connection failed") ||
    lower.includes("err_tunnel_connection_failed") ||
    lower.includes("err_proxy_connection_failed") ||
    lower.includes("ssl protocol error") ||
    lower.includes("err_ssl_protocol_error")
  ) {
    return ERROR_CODES.NAVER_PROXY_UNAVAILABLE;
  }

  if (lower.includes("connectovercdp") || lower.includes("retrieving websocket url")) {
    return ERROR_CODES.NAVER_SIDECAR_UNAVAILABLE;
  }

  if (lower.includes("timed out")) {
    return ERROR_CODES.NAVER_PROXY_UNAVAILABLE;
  }

  return ERROR_CODES.NAVER_SIDECAR_UNAVAILABLE;
}

function redactSecrets(message: string, options: CaptureOptions): string {
  let sanitized = message;

  const masks = [options.cdpUrl, options.proxyServer, options.proxyUsername, options.proxyPassword].filter(
    (value): value is string => Boolean(value)
  );

  for (const mask of masks) {
    sanitized = sanitized.split(mask).join("[REDACTED]");
  }

  sanitized = sanitized.replace(/:\/\/([^\s:@/]+):([^\s@/]+)@/g, "://[REDACTED]:[REDACTED]@");
  return sanitized;
}

function markSidecarHealthy() {
  dependencyHealth.sidecar.state = "healthy";
  dependencyHealth.sidecar.lastErrorAt = null;
  dependencyHealth.sidecar.lastErrorCode = null;
  dependencyHealth.sidecar.lastErrorMessage = null;
}

function recordSidecarFailure(code: string, message: string) {
  dependencyHealth.sidecar.state = "unhealthy";
  dependencyHealth.sidecar.lastErrorAt = new Date().toISOString();
  dependencyHealth.sidecar.lastErrorCode = code;
  dependencyHealth.sidecar.lastErrorMessage = message;
}

export const cdpInternalsForTest = {
  isBenefitsUrl,
  matchProductDetailsUrl,
  classifyCaptureError,
  redactSecrets,
  getFingerprintProfilesFromEnv,
  detectUpstreamPageNoticeText
};

async function applyResourceBlocking(page: Page, blockedResourceTypes: string[]) {
  if (blockedResourceTypes.length === 0) {
    return;
  }

  const blockedSet = new Set(blockedResourceTypes.map((item) => item.toLowerCase()));
  await page.route("**/*", async (route) => {
    const type = route.request().resourceType().toLowerCase();
    if (blockedSet.has(type)) {
      await route.abort();
      return;
    }

    await route.continue();
  });
}

function getBlockedResourceTypesFromEnv(): string[] {
  const raw = normalizeOptionalString(process.env.BLOCKED_RESOURCE_TYPES);
  if (!raw) {
    return ["image", "font", "media"];
  }

  return raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
}

function getFingerprintProfilesFromEnv(): FingerprintProfile[] {
  const raw = normalizeOptionalString(process.env.FINGERPRINT_PROFILES_JSON);
  if (!raw) {
    return DEFAULT_FINGERPRINT_PROFILES;
  }

  try {
    const parsed = JSON.parse(raw) as FingerprintProfile[];
    const normalized = parsed.filter((item) => isValidFingerprintProfile(item));
    return normalized.length > 0 ? normalized : DEFAULT_FINGERPRINT_PROFILES;
  } catch {
    return DEFAULT_FINGERPRINT_PROFILES;
  }
}

function getAvailableStorageStatePath(storageStatePath: string | null): string | null {
  if (!storageStatePath) {
    return null;
  }

  return existsSync(storageStatePath) ? storageStatePath : null;
}

function isValidFingerprintProfile(profile: FingerprintProfile | undefined): profile is FingerprintProfile {
  if (!profile) {
    return false;
  }

  if (!profile.id || !profile.userAgent || !profile.locale || !profile.timezoneId) {
    return false;
  }

  if (!profile.viewport) {
    return false;
  }

  if (profile.viewport.width <= 0 || profile.viewport.height <= 0) {
    return false;
  }

  return profile.colorScheme === "light" || profile.colorScheme === "dark";
}

function randomIntInclusive(min: number, max: number): number {
  if (min === max) {
    return min;
  }

  return Math.floor(Math.random() * (max - min + 1)) + min;
}
