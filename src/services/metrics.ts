import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
  type LabelValues
} from "prom-client";

const registry = new Registry();
collectDefaultMetrics({ register: registry });

const requestsTotal = new Counter({
  name: "naver_requests_total",
  help: "Total naver endpoint requests by outcome and cache mode",
  labelNames: ["outcome", "cache"] as const,
  registers: [registry]
});

const errorsTotal = new Counter({
  name: "naver_errors_total",
  help: "Total naver endpoint errors by code",
  labelNames: ["code"] as const,
  registers: [registry]
});

const queueWaitMsHistogram = new Histogram({
  name: "naver_queue_wait_ms",
  help: "Queue wait duration in milliseconds",
  buckets: [0, 5, 20, 50, 100, 250, 500, 1000, 2000, 4000],
  registers: [registry]
});

const upstreamMsHistogram = new Histogram({
  name: "naver_upstream_ms",
  help: "Upstream capture duration in milliseconds",
  buckets: [25, 100, 250, 500, 1000, 2000, 4000, 8000, 12000],
  registers: [registry]
});

const latencyMsHistogram = new Histogram({
  name: "naver_latency_ms",
  help: "End-to-end request latency in milliseconds",
  buckets: [25, 100, 250, 500, 1000, 2000, 4000, 8000, 12000],
  registers: [registry]
});

const queuePendingGauge = new Gauge({
  name: "naver_queue_pending",
  help: "Current number of requests waiting in queue",
  registers: [registry]
});

export function getMetricsRegistry() {
  return registry;
}

export function trackQueuePending(pending: number) {
  queuePendingGauge.set(pending);
}

export function trackRequest(
  labels: { outcome: "success" | "error"; cache: "hit" | "miss" },
  observations: { queueWaitMs: number; upstreamMs: number; latencyMs: number }
) {
  requestsTotal.inc(labels as LabelValues<"outcome" | "cache">);
  queueWaitMsHistogram.observe(observations.queueWaitMs);
  upstreamMsHistogram.observe(observations.upstreamMs);
  latencyMsHistogram.observe(observations.latencyMs);
}

export function trackError(code: string) {
  errorsTotal.inc({ code });
}
