import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import sensible from "@fastify/sensible";
import { Registry, collectDefaultMetrics } from "prom-client";
import { z } from "zod";
import { ERROR_CODES, type ErrorCode } from "./domain/errors";
import { parseNaverProductUrl } from "./domain/naver-url";
import {
  getDependencyHealthSnapshot
} from "./services/naver-cdp";
import { getQueueSnapshot, orchestrateCapture } from "./services/request-orchestrator";

const METRICS_REGISTRY = new Registry();
collectDefaultMetrics({ register: METRICS_REGISTRY });

const QUERY_SCHEMA = z.object({
  productUrl: z.string().min(1)
});

export function buildServer() {
  const app = Fastify({ logger: true });

  app.register(sensible);

  app.get("/health", async () => {
    return {
      status: "ok",
      uptimeSeconds: process.uptime(),
      timestamp: new Date().toISOString()
    };
  });

  app.get("/ready", async (_, reply) => {
    const deps = getDependencyHealthSnapshot();
    const queue = getQueueSnapshot();
    const isReady = deps.sidecar.state !== "unhealthy";

    if (!isReady) {
      reply.code(503);
    }

    return {
      status: isReady ? "ready" : "not-ready",
      checks: {
        api: "ok",
        sidecar: deps.sidecar.state,
        proxyConfigured: deps.proxy.configured,
        queuePending: queue.pending,
        workerPages: queue.workerPages
      },
      queue,
      dependencies: deps,
      timestamp: new Date().toISOString()
    };
  });

  app.get("/metrics", async (_, reply) => {
    reply.header("Content-Type", METRICS_REGISTRY.contentType);
    return METRICS_REGISTRY.metrics();
  });

  app.get("/naver", async (request, reply) => {
    const requestStartedAtMs = Date.now();
    const upstreamStartedAtMs = Date.now();
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
      return reply.code(400).send({
        success: false,
        requestId,
        error: productUrlResult.error,
        meta: buildMeta(requestStartedAtMs)
      });
    }

    const captureResult = await orchestrateCapture(productUrlResult.value);

    if (!captureResult.ok) {
      return reply.code(mapErrorToStatus(captureResult.error.code)).send({
        success: false,
        requestId,
        sourceUrl: productUrlResult.value.sourceUrl,
        storeName: productUrlResult.value.storeName,
        productId: productUrlResult.value.productId,
        error: captureResult.error,
        meta: {
          strategy: "cdp-network-capture",
          attempts: captureResult.meta.attempts,
          queueWaitMs: captureResult.meta.queueWaitMs,
          ...buildMeta(requestStartedAtMs),
          upstreamMs: Date.now() - upstreamStartedAtMs
        }
      });
    }

    return {
      success: true,
      requestId,
      sourceUrl: productUrlResult.value.sourceUrl,
      storeName: productUrlResult.value.storeName,
      productId: productUrlResult.value.productId,
      benefits: captureResult.value.benefits,
      productDetails: captureResult.value.productDetails,
      meta: {
        strategy: "cdp-network-capture",
        attempts: captureResult.meta.attempts,
        queueWaitMs: captureResult.meta.queueWaitMs,
        ...buildMeta(requestStartedAtMs),
        upstreamMs: Date.now() - upstreamStartedAtMs
      }
    };
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
    case ERROR_CODES.NAVER_QUEUE_TIMEOUT:
      return 503;
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
