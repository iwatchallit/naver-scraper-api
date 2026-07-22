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
  <title>WatScraper — Naver SmartStore Engine</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Outfit:wght@600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-obsidian: #090d16;
      --surface-panel: #111827;
      --surface-raised: #1f2937;
      --emerald-mint: #10b981;
      --emerald-hover: #059669;
      --electric-cyan: #06b6d4;
      --text-bright: #f9fafb;
      --text-muted: #9ca3af;
      --border-subtle: rgba(255, 255, 255, 0.1);
      --rose-danger: #ef4444;
    }
    * { box-sizing: border-box; }
    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      max-width: 860px;
      margin: 0 auto;
      padding: 2.5rem 1.25rem;
      background-color: var(--bg-obsidian);
      color: var(--text-bright);
      line-height: 1.5;
    }
    .header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
    }
    .brand-title {
      font-family: 'Outfit', sans-serif;
      font-size: 1.75rem;
      font-weight: 800;
      margin: 0;
      background: linear-gradient(135deg, #f9fafb 0%, #10b981 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .docs-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      background: rgba(6, 182, 212, 0.12);
      color: var(--electric-cyan);
      border: 1px solid rgba(6, 182, 212, 0.3);
      padding: 0.4rem 0.85rem;
      border-radius: 20px;
      font-size: 0.85rem;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.2s;
    }
    .docs-badge:hover {
      background: rgba(6, 182, 212, 0.25);
      border-color: var(--electric-cyan);
      transform: translateY(-1px);
    }
    .card {
      background: var(--surface-panel);
      padding: 2rem;
      border-radius: 16px;
      border: 1px solid var(--border-subtle);
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
    }
    .card p {
      color: var(--text-muted);
      margin-top: 0;
      margin-bottom: 1.5rem;
      font-size: 0.95rem;
    }
    input[type="url"] {
      width: 100%;
      padding: 0.85rem 1rem;
      margin-bottom: 1.25rem;
      background: var(--surface-raised);
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
      color: var(--text-bright);
      font-size: 0.95rem;
      font-family: inherit;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    input[type="url"]:focus {
      outline: none;
      border-color: var(--emerald-mint);
      box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);
    }
    .checkbox-label {
      display: flex;
      align-items: center;
      margin-bottom: 1.5rem;
      font-size: 0.875rem;
      color: var(--text-muted);
      cursor: pointer;
      user-select: none;
    }
    .checkbox-label input {
      width: 16px;
      height: 16px;
      accent-color: var(--emerald-mint);
      margin-right: 0.75rem;
    }
    button.submit-btn {
      background: linear-gradient(135deg, var(--emerald-mint) 0%, var(--emerald-hover) 100%);
      color: #04120a;
      border: none;
      padding: 0.85rem 1.75rem;
      border-radius: 10px;
      cursor: pointer;
      font-weight: 700;
      width: 100%;
      font-size: 1rem;
      font-family: 'Outfit', sans-serif;
      letter-spacing: 0.02em;
      transition: all 0.2s;
      box-shadow: 0 4px 14px rgba(16, 185, 129, 0.3);
    }
    button.submit-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 20px rgba(16, 185, 129, 0.45);
    }
    button.submit-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }
    pre {
      background: #030712;
      color: #34d399;
      padding: 1.25rem;
      border-radius: 10px;
      border: 1px solid var(--border-subtle);
      overflow-x: auto;
      max-height: 500px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.85rem;
      margin-top: 1.5rem;
    }
    .loading {
      display: none;
      margin-top: 1.25rem;
      color: var(--electric-cyan);
      font-style: italic;
      text-align: center;
      font-size: 0.9rem;
    }
    
    /* Floating button & Drawer CSS */
    .fab {
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      background: var(--emerald-mint);
      color: #04120a;
      padding: 0.85rem 1.5rem;
      border-radius: 30px;
      box-shadow: 0 10px 25px -5px rgba(16, 185, 129, 0.5);
      cursor: pointer;
      z-index: 1001;
      font-weight: 700;
      border: none;
      font-family: 'Outfit', sans-serif;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      transition: all 0.2s;
    }
    .fab:hover {
      transform: scale(1.05);
      background: #34d399;
    }
    .drawer {
      position: fixed;
      top: 0;
      right: -100vw;
      width: 420px;
      max-width: 100vw;
      height: 100vh;
      background: var(--surface-panel);
      box-shadow: -10px 0 30px rgba(0, 0, 0, 0.7);
      transition: right 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      z-index: 1000;
      overflow-y: auto;
      padding: 1.5rem 1.25rem;
      border-left: 1px solid var(--border-subtle);
    }
    .drawer.open { right: 0; }
    .drawer-close-btn {
      background: var(--surface-raised);
      border: 1px solid var(--border-subtle);
      color: var(--text-muted);
      font-size: 1.25rem;
      width: 36px;
      height: 36px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s;
    }
    .drawer-close-btn:hover {
      color: var(--text-bright);
      background: rgba(255, 255, 255, 0.1);
    }
    .drawer h2 {
      font-family: 'Outfit', sans-serif;
      margin-top: 0;
      color: var(--text-bright);
      font-size: 1.35rem;
      margin-bottom: 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .drawer-overlay {
      display: none;
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(3px);
      z-index: 999;
    }
    .drawer.open ~ .drawer-overlay { display: block; }
    .log-card {
      background: var(--surface-raised);
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
      padding: 1rem;
      margin-bottom: 1rem;
    }
    .log-card.success { border-left: 4px solid var(--emerald-mint); }
    .log-card.error { border-left: 4px solid var(--rose-danger); }
    .log-time { font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.4rem; font-family: 'JetBrains Mono', monospace; }
    .log-url { font-size: 0.85rem; word-break: break-all; margin-bottom: 0.5rem; color: var(--text-bright); }
    .log-thumb {
      width: 100%;
      max-height: 130px;
      object-fit: cover;
      border-radius: 6px;
      cursor: pointer;
      margin-top: 0.5rem;
      border: 1px solid var(--border-subtle);
      transition: opacity 0.2s;
    }
    .log-thumb:hover { opacity: 0.85; }
    
    /* Lightbox Modal */
    .lightbox {
      display: none;
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.92);
      backdrop-filter: blur(8px);
      z-index: 2000;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
    .lightbox.active { display: flex; }
    .lightbox img { max-width: 95%; max-height: 90vh; object-fit: contain; border-radius: 8px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8); }
    .lightbox-close {
      position: absolute;
      top: 1.5rem;
      right: 2rem;
      color: var(--text-bright);
      font-size: 2.5rem;
      cursor: pointer;
      line-height: 1;
    }
  </style>
</head>
<body>
  <div class="header-bar">
    <h1 class="brand-title">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
      WatScraper
    </h1>
    <a href="/docs" class="docs-badge" target="_blank">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      Swagger API Docs ↗
    </a>
  </div>

  <div class="card">
    <p>Paste any Naver SmartStore or BrandStore Product URL below to extract full JSON payloads and bypass anti-bot challenges in real time.</p>
    <form id="scrapeForm">
      <input type="url" id="productUrl" placeholder="https://brand.naver.com/store/products/123..." required>
      <label class="checkbox-label">
        <input type="checkbox" id="takeScreenshot">
        Capture visual screenshot on success (automatically captured on errors)
      </label>
      <button type="submit" id="submitBtn" class="submit-btn">Scrape Product JSON</button>
    </form>
    <div id="loading" class="loading">⚡ Scraping Naver via CDP Sidecar... (Bypassing anti-bot, please wait)</div>
    <img id="screenshot" style="display: none; width: 100%; margin-top: 1.25rem; border-radius: 8px; border: 1px solid var(--border-subtle);" alt="Naver Capture Screenshot">
    <pre id="result" style="display: none;"></pre>
  </div>

  <button class="fab" id="fab">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
    View Logs
  </button>
  
  <div class="drawer" id="drawer">
    <h2>
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <span>Scrape History</span>
        <span style="font-size: 0.75rem; font-weight: 500; color: var(--text-muted);">(Max 500)</span>
      </div>
      <button class="drawer-close-btn" id="drawerClose" aria-label="Close Logs">&times;</button>
    </h2>
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

    const drawerClose = document.getElementById('drawerClose');

    document.getElementById('fab').addEventListener('click', async () => {
      if (drawer.classList.contains('open')) {
        drawer.classList.remove('open');
      } else {
        drawer.classList.add('open');
        await loadLogs();
      }
    });

    drawerClose.addEventListener('click', () => {
      drawer.classList.remove('open');
    });

    overlay.addEventListener('click', () => {
      drawer.classList.remove('open');
    });

    document.getElementById('lightboxClose').addEventListener('click', () => {
      lightbox.classList.remove('active');
    });

    async function loadLogs() {
      try {
        logsContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 0.9rem;">Loading logs...</div>';
        const res = await fetch('/logs');
        const data = await res.json();
        
        if (!data.logs || data.logs.length === 0) {
          logsContainer.innerHTML = '<p style="color: var(--text-muted);">No logs found.</p>';
          return;
        }

        logsContainer.innerHTML = '';
        data.logs.forEach(log => {
          const card = document.createElement('div');
          card.className = \`log-card \${log.status}\`;
          
          let content = \`
            <div class="log-time">\${new Date(log.timestamp).toLocaleString()} (\${log.latencyMs}ms)</div>
            <div class="log-url">\${log.url}</div>
            <div style="color: \${log.status === 'success' ? 'var(--emerald-mint)' : 'var(--rose-danger)'}; font-weight: 600; font-size: 0.85rem;">
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
        logsContainer.innerHTML = '<p style="color: var(--rose-danger);">Error loading logs</p>';
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
      
      return reply.code(status as any).send({
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
