import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import sensible from "@fastify/sensible";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import { z } from "zod";
import { ERROR_CODES, type ErrorCode } from "./domain/errors";
import { parseNaverProductUrl } from "./domain/naver-url";
import {
  getAntiDetectionSnapshot,
  getDependencyHealthSnapshot
} from "./services/naver-cdp";
import { getCachedCapture, setCachedCapture } from "./services/capture-cache";
import {
  getMetricsRegistry,
  trackError,
  trackQueuePending,
  trackRequest
} from "./services/metrics";
import { getQueueSnapshot, orchestrateCapture } from "./services/request-orchestrator";
import { getLogs, insertLog } from "./services/db";

const METRICS_REGISTRY = getMetricsRegistry();

const QUERY_SCHEMA = z.object({
  productUrl: z.string().min(1),
  screenshot: z.enum(["true", "false"]).optional().default("false").transform(val => val === "true")
});

interface BuildServerDeps {
  orchestrateCapture: typeof orchestrateCapture;
  getDependencyHealthSnapshot: typeof getDependencyHealthSnapshot;
  getQueueSnapshot: typeof getQueueSnapshot;
  getAntiDetectionSnapshot: typeof getAntiDetectionSnapshot;
}

export function buildServer(overrides?: Partial<BuildServerDeps>) {
  const deps: BuildServerDeps = {
    orchestrateCapture: overrides?.orchestrateCapture ?? orchestrateCapture,
    getDependencyHealthSnapshot:
      overrides?.getDependencyHealthSnapshot ?? getDependencyHealthSnapshot,
    getQueueSnapshot: overrides?.getQueueSnapshot ?? getQueueSnapshot,
    getAntiDetectionSnapshot: overrides?.getAntiDetectionSnapshot ?? getAntiDetectionSnapshot
  };

  const app = Fastify({ logger: true });

  app.register(sensible);
  
  app.register(fastifySwagger, {
    openapi: {
      info: {
        title: "Naver SmartStore Scraper API",
        description: "API for scraping product details and benefits from Naver SmartStore.",
        version: "1.0.0"
      },
      tags: [{ name: "scraper", description: "Scraper endpoints" }]
    }
  });

  app.register(fastifySwaggerUi, {
    routePrefix: "/docs"
  });

  app.register(async function (app) {
    app.get("/", async (_, reply) => {
    reply.header("Content-Type", "text/html");
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Naver Scraper Forwarder</title>
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; background: #f9fafb; color: #111827; }
    .card { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
    h2 { margin-top: 0; color: #03c75a; }
    input { width: 100%; padding: 0.75rem; margin-bottom: 1rem; border: 1px solid #d1d5db; border-radius: 6px; box-sizing: border-box; font-size: 1rem; }
    button { background: #03c75a; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 6px; cursor: pointer; font-weight: bold; width: 100%; font-size: 1rem; transition: background 0.2s; }
    button:hover { background: #02b350; }
    button:disabled { background: #9ca3af; cursor: not-allowed; }
    pre { background: #1f2937; color: #f3f4f6; padding: 1rem; border-radius: 8px; overflow-x: auto; max-height: 600px; font-size: 0.875rem; }
    .loading { display: none; margin-top: 1rem; color: #6b7280; font-style: italic; text-align: center; }
    
    /* Floating button & Drawer CSS */
    .fab { position: fixed; bottom: 2rem; right: 2rem; background: #03c75a; color: white; padding: 1rem 1.5rem; border-radius: 30px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); cursor: pointer; z-index: 1001; font-weight: bold; border: none; }
    .drawer { position: fixed; top: 0; right: -400px; width: 400px; height: 100vh; background: #fff; box-shadow: -4px 0 10px rgba(0,0,0,0.1); transition: right 0.3s ease; z-index: 1000; overflow-y: auto; padding: 2rem; box-sizing: border-box; }
    .drawer.open { right: 0; }
    .drawer-overlay { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.4); z-index: 999; }
    .drawer.open ~ .drawer-overlay { display: block; }
    .log-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
    .log-card.success { border-left: 4px solid #03c75a; }
    .log-card.error { border-left: 4px solid #ef4444; }
    .log-time { font-size: 0.8rem; color: #6b7280; margin-bottom: 0.5rem; }
    .log-url { font-size: 0.9rem; word-break: break-all; margin-bottom: 0.5rem; color: #111827; }
    .log-thumb { width: 100%; max-height: 120px; object-fit: cover; border-radius: 4px; cursor: pointer; margin-top: 0.5rem; border: 1px solid #e5e7eb; }
    
    /* Lightbox Modal */
    .lightbox { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.9); z-index: 2000; align-items: center; justify-content: center; padding: 2rem; }
    .lightbox.active { display: flex; }
    .lightbox img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .lightbox-close { position: absolute; top: 2rem; right: 2rem; color: white; font-size: 2rem; cursor: pointer; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Naver Scraper Dashboard</h2>
    <p>Paste a Naver SmartStore Product URL below to extract its full JSON details in real-time via the API.</p>
    <form id="scrapeForm">
      <input type="url" id="productUrl" placeholder="https://brand.naver.com/store/products/123..." required>
      <label style="display: flex; align-items: center; margin-bottom: 1rem; font-size: 0.9rem; cursor: pointer;">
        <input type="checkbox" id="takeScreenshot" style="width: auto; margin-right: 0.5rem; margin-bottom: 0;">
        Take visual screenshot on success (automatically taken on errors)
      </label>
      <button type="submit" id="submitBtn">Scrape JSON</button>
    </form>
    <div id="loading" class="loading">Scraping Naver... (Bypassing anti-bot, please wait)</div>
    <img id="screenshot" style="display: none; width: 100%; margin-top: 1rem; border-radius: 8px; border: 1px solid #d1d5db;" alt="Naver Capture Screenshot">
    <pre id="result" style="display: none;"></pre>
  </div>

  <button class="fab" id="fab">View Logs</button>
  
  <div class="drawer" id="drawer">
    <h2>Scrape History</h2>
    <div id="logsContainer">Loading logs...</div>
  </div>
  <div class="drawer-overlay" id="overlay"></div>

  <div class="lightbox" id="lightbox">
    <div class="lightbox-close" id="lightboxClose">&times;</div>
    <img id="lightboxImg" src="">
  </div>

  <script>
    const drawer = document.getElementById('drawer');
    const overlay = document.getElementById('overlay');
    const logsContainer = document.getElementById('logsContainer');
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightboxImg');

    document.getElementById('fab').addEventListener('click', async () => {
      drawer.classList.add('open');
      await loadLogs();
    });

    overlay.addEventListener('click', () => {
      drawer.classList.remove('open');
    });

    document.getElementById('lightboxClose').addEventListener('click', () => {
      lightbox.classList.remove('active');
    });

    async function loadLogs() {
      try {
        logsContainer.innerHTML = 'Loading logs...';
        const res = await fetch('/logs');
        const data = await res.json();
        
        if (!data.logs || data.logs.length === 0) {
          logsContainer.innerHTML = '<p>No logs found.</p>';
          return;
        }

        logsContainer.innerHTML = '';
        data.logs.forEach(log => {
          const card = document.createElement('div');
          card.className = \`log-card \${log.status}\`;
          
          let content = \`
            <div class="log-time">\${new Date(log.timestamp).toLocaleString()} (\${log.latencyMs}ms)</div>
            <div class="log-url">\${log.url}</div>
            <div style="color: \${log.status === 'success' ? '#03c75a' : '#ef4444'}; font-weight: bold; font-size: 0.9rem;">
              \${log.status.toUpperCase()} \${log.errorMessage ? ': ' + log.errorMessage : ''}
            </div>
          \`;

          if (log.screenshotBase64) {
            content += \`<img src="data:image/jpeg;base64,\${log.screenshotBase64}" class="log-thumb" onclick="openLightbox(this.src)">\`;
          }

          card.innerHTML = content;
          logsContainer.appendChild(card);
        });
      } catch (err) {
        logsContainer.innerHTML = '<p>Error loading logs</p>';
      }
    }

    function openLightbox(src) {
      lightboxImg.src = src;
      lightbox.classList.add('active');
    }

    document.getElementById('scrapeForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const url = document.getElementById('productUrl').value;
      const takeScreenshot = document.getElementById('takeScreenshot').checked;
      const resultEl = document.getElementById('result');
      const screenshotEl = document.getElementById('screenshot');
      const loadingEl = document.getElementById('loading');
      const btn = document.getElementById('submitBtn');
      
      resultEl.style.display = 'none';
      screenshotEl.style.display = 'none';
      loadingEl.style.display = 'block';
      btn.disabled = true;
      
      try {
        const queryParams = new URLSearchParams({ productUrl: url, screenshot: takeScreenshot.toString() });
        const response = await fetch('/naver?' + queryParams.toString());
        const data = await response.json();
        
        if (data.screenshotBase64) {
          screenshotEl.src = 'data:image/jpeg;base64,' + data.screenshotBase64;
          screenshotEl.style.display = 'block';
          delete data.screenshotBase64; // Remove from JSON payload for cleaner display
        }
        
        resultEl.textContent = JSON.stringify(data, null, 2);
        resultEl.style.display = 'block';
      } catch (err) {
        resultEl.textContent = "Error: " + err.message;
        resultEl.style.display = 'block';
      } finally {
        loadingEl.style.display = 'none';
        btn.disabled = false;
        
        // Refresh logs if drawer is open
        if (drawer.classList.contains('open')) {
          loadLogs();
        }
      }
    });
  </script>
</body>
</html>
    `;
  });

  app.get("/health", async () => {
    return {
      status: "ok",
      uptimeSeconds: process.uptime(),
      timestamp: new Date().toISOString()
    };
  });

  app.get("/ready", async (_, reply) => {
    const dependencyHealth = deps.getDependencyHealthSnapshot();
    const queue = deps.getQueueSnapshot();
    const isReady = dependencyHealth.sidecar.state !== "unhealthy";

    if (!isReady) {
      reply.code(503);
    }

    return {
      status: isReady ? "ready" : "not-ready",
      checks: {
        api: "ok",
        sidecar: dependencyHealth.sidecar.state,
        proxyConfigured: dependencyHealth.proxy.configured,
        queuePending: queue.pending,
        workerPages: queue.workerPages
      },
      queue,
      dependencies: dependencyHealth,
      antiDetection: deps.getAntiDetectionSnapshot(),
      timestamp: new Date().toISOString()
    };
  });

  app.get("/anti-detection", async () => {
    return {
      status: "ok",
      snapshot: deps.getAntiDetectionSnapshot(),
      timestamp: new Date().toISOString()
    };
  });

  app.get("/metrics", async (_, reply) => {
    const queue = deps.getQueueSnapshot();
    trackQueuePending(queue.pending);
    reply.header("Content-Type", METRICS_REGISTRY.contentType);
    return METRICS_REGISTRY.metrics();
  });

  app.get("/logs", { schema: { hide: true } }, async () => {
    return {
      success: true,
      logs: getLogs()
    };
  });

  app.get("/naver", {
    schema: {
      description: "Extract JSON details from a Naver SmartStore product URL",
      tags: ["scraper"],
      querystring: {
        type: "object",
        required: ["productUrl"],
        properties: {
          productUrl: { type: "string", description: "The full URL of the Naver SmartStore product" },
          screenshot: { type: "boolean", description: "Whether to return a base64 visual screenshot on success" }
        }
      },
      response: {
        400: {
          type: "object",
          description: "Bad Request or Validation Error",
          properties: {
            success: { type: "boolean" },
            requestId: { type: "string" },
            error: {
              type: "object",
              properties: {
                code: { type: "string" },
                message: { type: "string" },
                details: { type: "object", additionalProperties: true }
              }
            }
          }
        },
        500: {
          type: "object",
          description: "Internal Server Error or Capture Timeout",
          properties: {
            success: { type: "boolean" },
            requestId: { type: "string" },
            error: {
              type: "object",
              properties: {
                code: { type: "string" },
                message: { type: "string" }
              }
            },
            screenshotBase64: { type: "string", description: "Visual proof of the failure (e.g., CAPTCHA, 404)" }
          }
        }
      }
    }
  }, async (request, reply) => {
    const requestStartedAtMs = Date.now();
    const requestId = randomUUID();

    const parsedQuery = QUERY_SCHEMA.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.code(400).send({
        success: false,
        requestId,
        error: {
          code: ERROR_CODES.NAVER_INVALID_URL,
          message: "productUrl query parameter is required"
        },
        meta: buildMeta(requestStartedAtMs)
      });
    }

    const productUrlResult = parseNaverProductUrl(parsedQuery.data.productUrl);
    if (!productUrlResult.ok) {
      trackError(productUrlResult.error.code);
      trackRequest(
        { outcome: "error", cache: "miss" },
        {
          queueWaitMs: 0,
          upstreamMs: 0,
          latencyMs: Date.now() - requestStartedAtMs
        }
      );

      return reply.code(400).send({
        success: false,
        requestId,
        error: productUrlResult.error,
        meta: buildMeta(requestStartedAtMs)
      });
    }

    const cacheKey = productUrlResult.value.sourceUrl;
    const cachedCapture = getCachedCapture(cacheKey);
    if (cachedCapture) {
      const latencyMs = Date.now() - requestStartedAtMs;
      trackRequest(
        { outcome: "success", cache: "hit" },
        {
          queueWaitMs: 0,
          upstreamMs: 0,
          latencyMs
        }
      );

      return {
        success: true,
        requestId,
        sourceUrl: productUrlResult.value.sourceUrl,
        storeName: productUrlResult.value.storeName,
        productId: productUrlResult.value.productId,
        benefits: cachedCapture.benefits,
        productDetails: cachedCapture.productDetails,
        meta: {
          strategy: "cdp-network-capture",
          cache: "hit",
          attempts: 0,
          queueWaitMs: 0,
          upstreamMs: 0,
          ...buildMeta(requestStartedAtMs)
        }
      };
    }

    const upstreamStartedAtMs = Date.now();

    const captureResult = await deps.orchestrateCapture(productUrlResult.value, { 
      takeScreenshot: parsedQuery.data.screenshot 
    });
    const upstreamMs = Date.now() - upstreamStartedAtMs;
    const latencyMs = Date.now() - requestStartedAtMs;

    if (!captureResult.ok) {
      trackError(captureResult.error.code);
      trackRequest(
        { outcome: "error", cache: "miss" },
        {
          queueWaitMs: captureResult.meta.queueWaitMs,
          upstreamMs,
          latencyMs
        }
      );

      const status = mapErrorToStatus(captureResult.error.code);
      insertLog(productUrlResult.value.sourceUrl, "error", latencyMs, captureResult.error.message, captureResult.screenshotBase64);
      
      return reply.code(status).send({
        success: false,
        requestId,
        sourceUrl: productUrlResult.value.sourceUrl,
        storeName: productUrlResult.value.storeName,
        productId: productUrlResult.value.productId,
        error: captureResult.error,
        screenshotBase64: captureResult.screenshotBase64,
        meta: {
          strategy: "cdp-network-capture",
          cache: "miss",
          attempts: captureResult.meta.attempts,
          queueWaitMs: captureResult.meta.queueWaitMs,
          ...buildMeta(requestStartedAtMs),
          upstreamMs
        }
      });
    }

    setCachedCapture(cacheKey, captureResult.value);
    trackRequest(
      { outcome: "success", cache: "miss" },
      {
        queueWaitMs: captureResult.meta.queueWaitMs,
        upstreamMs,
        latencyMs
      }
    );
    
    insertLog(productUrlResult.value.sourceUrl, "success", latencyMs, undefined, captureResult.screenshotBase64);

    return {
      success: true,
      requestId,
      sourceUrl: productUrlResult.value.sourceUrl,
      storeName: productUrlResult.value.storeName,
      productId: productUrlResult.value.productId,
      benefits: captureResult.value.benefits,
      productDetails: captureResult.value.productDetails,
      screenshotBase64: captureResult.screenshotBase64,
      meta: {
        strategy: "cdp-network-capture",
        cache: "miss",
        attempts: captureResult.meta.attempts,
        queueWaitMs: captureResult.meta.queueWaitMs,
        ...buildMeta(requestStartedAtMs),
        upstreamMs
      }
    };
  });
  });

  return app;
}

function buildMeta(startedAtMs: number) {
  return {
    timestamp: new Date().toISOString(),
    latencyMs: Date.now() - startedAtMs
  };
}

function mapErrorToStatus(code: ErrorCode): number {
  switch (code) {
    case ERROR_CODES.NAVER_INVALID_URL:
      return 400;
    case ERROR_CODES.NAVER_INVALID_UPSTREAM_JSON:
      return 502;
    case ERROR_CODES.NAVER_CAPTURE_TIMEOUT:
      return 504;
    case ERROR_CODES.NAVER_TARGET_UNAVAILABLE:
      return 503;
    case ERROR_CODES.NAVER_QUEUE_TIMEOUT:
      return 503;
    case ERROR_CODES.NAVER_UPSTREAM_CHALLENGE:
      return 403;
    case ERROR_CODES.NAVER_PROXY_AUTH_FAILED:
      return 502;
    case ERROR_CODES.NAVER_PROXY_UNAVAILABLE:
      return 503;
    case ERROR_CODES.NAVER_SIDECAR_UNAVAILABLE:
      return 503;
    default:
      return 500;
  }
}
