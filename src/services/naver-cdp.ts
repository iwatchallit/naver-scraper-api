import { chromium, type Browser, type BrowserContext, type Page, type Response } from "playwright-core";
import { createEmptyCaptureResult, type NaverCaptureResult } from "../domain/capture";
import { ERROR_CODES, type ApiErrorShape } from "../domain/errors";
import type { NaverProductUrlInfo } from "../domain/naver-url";

const PRODUCT_DETAILS_REGEX = /\/i\/v2\/channels\/([^/]+)\/products\/(\d+)(?:\?|$)/;
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
}

export interface CaptureSuccess {
  ok: true;
  value: NaverCaptureResult;
}

export interface CaptureFailure {
  ok: false;
  error: ApiErrorShape;
}

export type CaptureAttemptResult = CaptureSuccess | CaptureFailure;

export function getCaptureOptionsFromEnv(): CaptureOptions {
  const proxyServer = normalizeOptionalString(process.env.PROXY_SERVER);
  const proxyUsername = normalizeOptionalString(process.env.PROXY_USERNAME);
  const proxyPassword = normalizeOptionalString(process.env.PROXY_PASSWORD);

  return {
    cdpUrl: process.env.CDP_URL ?? "http://127.0.0.1:9222",
    navigationTimeoutMs: toPositiveInt(process.env.NAVIGATION_TIMEOUT_MS, 8000),
    captureGraceMs: toPositiveInt(process.env.CAPTURE_GRACE_MS, 4000),
    proxyServer,
    proxyUsername,
    proxyPassword,
    cdpConnectRetries: toPositiveInt(process.env.CDP_CONNECT_RETRIES, 2),
    cdpRetryDelayMs: toPositiveInt(process.env.CDP_RETRY_DELAY_MS, 250),
    blockedResourceTypes: getBlockedResourceTypesFromEnv()
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

  dependencyHealth.proxy.configured = Boolean(options.proxyServer);
  dependencyHealth.proxy.server = options.proxyServer;

  try {
    context = await createContext(options);
    page = await context.newPage();
    await applyResourceBlocking(page, options.blockedResourceTypes);

    const capture = createEmptyCaptureResult();
    const diagnostics = createCaptureDiagnostics();
    attachResponseCapture(page, productUrl.productId, capture, diagnostics);

    await page.goto(productUrl.sourceUrl, {
      waitUntil: "domcontentloaded",
      timeout: options.navigationTimeoutMs
    });

    await waitForCapture(capture, options.captureGraceMs);

    if (capture.productDetails.state !== "captured") {
      await fallbackFetchProductDetails(page, productUrl.productId, capture, diagnostics, options);
    }

    if (capture.benefits.state === "not-captured") {
      capture.benefits.state = "absent";
    }

    if (capture.productDetails.state !== "captured") {
      if (capture.productDetails.state === "invalid-json") {
        return {
          ok: false,
          error: {
            code: ERROR_CODES.NAVER_INVALID_UPSTREAM_JSON,
            message: "Product details endpoint returned non-JSON content"
          }
        };
      }

      return {
        ok: false,
        error: {
          code: ERROR_CODES.NAVER_CAPTURE_TIMEOUT,
          message: buildCaptureTimeoutMessage(diagnostics)
        }
      };
    }

    return {
      ok: true,
      value: capture
    };
  } catch (error) {
    invalidateSidecarConnection();

    const rawMessage = error instanceof Error ? error.message : "Unknown CDP error";
    const code = classifyCaptureError(rawMessage);
    const message = redactSecrets(rawMessage, options);

    recordSidecarFailure(code, message);

    return {
      ok: false,
      error: {
        code,
        message: `Failed to capture through CDP sidecar: ${message}`
      }
    };
  } finally {
    await page?.close({ runBeforeUnload: false }).catch(() => undefined);
    await context?.close().catch(() => undefined);
  }
}

interface CaptureDiagnostics {
  observedProductDetailsUrls: string[];
  observedChannelUid: string | null;
}

function createCaptureDiagnostics(): CaptureDiagnostics {
  return {
    observedProductDetailsUrls: [],
    observedChannelUid: null
  };
}

function attachResponseCapture(
  page: Page,
  requestedProductId: string,
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
        return;
      }

      pushObservedProductDetailsUrl(diagnostics, url);

      const [, channelUid, productId] = detailsMatch;
      diagnostics.observedChannelUid = channelUid;

      if (productId !== requestedProductId) {
        return;
      }

      await captureProductDetailsResponse(response, capture, channelUid);
    }
  });
}

async function fallbackFetchProductDetails(
  page: Page,
  requestedProductId: string,
  capture: NaverCaptureResult,
  diagnostics: CaptureDiagnostics,
  options: CaptureOptions
) {
  const channelUid =
    diagnostics.observedChannelUid ?? (await extractChannelUidFromPage(page)).channelUid ?? null;

  if (!channelUid) {
    return;
  }

  const detailsUrl = `https://smartstore.naver.com/i/v2/channels/${channelUid}/products/${requestedProductId}?withWindow=false`;

  try {
    const response = await page.request.get(detailsUrl, {
      timeout: options.navigationTimeoutMs,
      headers: {
        accept: "application/json, text/plain, */*"
      }
    });

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
  if (diagnostics.observedProductDetailsUrls.length === 0) {
    return "Could not capture product details payload within timeout; no matching product-details responses were observed";
  }

  return `Could not capture product details payload within timeout; observed candidates: ${diagnostics.observedProductDetailsUrls.join(" | ")}`;
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
  return url.includes("/benefits/by-product");
}

function matchProductDetailsUrl(url: string): RegExpMatchArray | null {
  return url.match(PRODUCT_DETAILS_REGEX);
}

async function createContext(options: CaptureOptions): Promise<BrowserContext> {
  const browser = await getOrCreateBrowser(options);

  if (options.proxyServer) {
    return browser.newContext({
      proxy: {
        server: options.proxyServer,
        username: options.proxyUsername ?? undefined,
        password: options.proxyPassword ?? undefined
      }
    });
  }

  return browser.newContext();
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

function normalizeOptionalString(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function classifyCaptureError(message: string): ApiErrorShape["code"] {
  const lower = message.toLowerCase();

  if (lower.includes("407") || lower.includes("proxy authentication")) {
    return ERROR_CODES.NAVER_PROXY_AUTH_FAILED;
  }

  if (lower.includes("proxy")) {
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
