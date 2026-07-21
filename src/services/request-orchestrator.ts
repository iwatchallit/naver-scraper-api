import { ERROR_CODES, type ApiErrorShape } from "../domain/errors";
import type { NaverProductUrlInfo } from "../domain/naver-url";
import {
  captureProductPayloads,
  getCaptureOptionsFromEnv,
  type CaptureAttemptResult,
  type CaptureOptions,
  type CaptureSuccess
} from "./naver-cdp";

interface QueueWaiter {
  resolve: (release: () => void) => void;
  reject: (error: Error) => void;
  timeoutId: NodeJS.Timeout;
}

export class WorkerPoolQueue {
  private readonly workers: number;
  private active = 0;
  private readonly queue: QueueWaiter[] = [];

  constructor(workers: number) {
    this.workers = workers;
  }

  pending(): number {
    return this.queue.length;
  }

  acquire(maxQueueDepth: number, waitTimeoutMs: number): Promise<() => void> {
    if (this.active < this.workers) {
      this.active += 1;
      return Promise.resolve(this.createRelease());
    }

    if (this.queue.length >= maxQueueDepth) {
      return Promise.reject(new Error("queue is full"));
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const index = this.queue.findIndex((item) => item.reject === reject);
        if (index >= 0) {
          this.queue.splice(index, 1);
        }

        reject(new Error("queue wait timeout"));
      }, waitTimeoutMs);

      this.queue.push({ resolve, reject, timeoutId });
    });
  }

  private createRelease(): () => void {
    let released = false;

    return () => {
      if (released) {
        return;
      }

      released = true;
      this.active = Math.max(0, this.active - 1);

      const next = this.queue.shift();
      if (!next) {
        return;
      }

      clearTimeout(next.timeoutId);
      this.active += 1;
      next.resolve(this.createRelease());
    };
  }
}

export interface RequestOrchestrationOptions {
  workerPages: number;
  maxQueueDepth: number;
  queueWaitTimeoutMs: number;
  globalRequestTimeoutMs: number;
  maxAttempts: number;
}

export interface CaptureRuntimeMeta {
  attempts: number;
  queueWaitMs: number;
}

export interface OrchestratedCaptureSuccess {
  ok: true;
  value: CaptureSuccess["value"];
  meta: CaptureRuntimeMeta;
}

export interface OrchestratedCaptureFailure {
  ok: false;
  error: ApiErrorShape;
  meta: CaptureRuntimeMeta;
}

export type OrchestratedCaptureResult = OrchestratedCaptureSuccess | OrchestratedCaptureFailure;

const orchestrationOptions = getRequestOrchestrationOptionsFromEnv();
const queue = new WorkerPoolQueue(orchestrationOptions.workerPages);

export function getRequestOrchestrationOptionsFromEnv(): RequestOrchestrationOptions {
  return {
    workerPages: toPositiveInt(process.env.WORKER_PAGES, 2),
    maxQueueDepth: toPositiveInt(process.env.MAX_QUEUE_DEPTH, 50),
    queueWaitTimeoutMs: toPositiveInt(process.env.QUEUE_WAIT_TIMEOUT_MS, 4000),
    globalRequestTimeoutMs: toPositiveInt(process.env.GLOBAL_REQUEST_TIMEOUT_MS, 12000),
    maxAttempts: toPositiveInt(process.env.MAX_ATTEMPTS, 2)
  };
}

export function getQueueSnapshot() {
  return {
    workerPages: orchestrationOptions.workerPages,
    maxQueueDepth: orchestrationOptions.maxQueueDepth,
    pending: queue.pending()
  };
}

export async function orchestrateCapture(
  productUrl: NaverProductUrlInfo
): Promise<OrchestratedCaptureResult> {
  const queuedAt = Date.now();
  let release: (() => void) | null = null;

  try {
    release = await queue.acquire(
      orchestrationOptions.maxQueueDepth,
      orchestrationOptions.queueWaitTimeoutMs
    );
  } catch {
    return {
      ok: false,
      error: {
        code: ERROR_CODES.NAVER_QUEUE_TIMEOUT,
        message: "Timed out while waiting for an available worker"
      },
      meta: {
        attempts: 0,
        queueWaitMs: Date.now() - queuedAt
      }
    };
  }

  const queueWaitMs = Date.now() - queuedAt;
  const deadlineAt = Date.now() + orchestrationOptions.globalRequestTimeoutMs;
  const captureOptions = getCaptureOptionsFromEnv();
  const minimumAttemptBudgetMs = getMinimumAttemptBudgetMs(captureOptions);
  const budgetedAttempts = getBudgetedAttemptCount(
    orchestrationOptions.globalRequestTimeoutMs,
    orchestrationOptions.maxAttempts,
    minimumAttemptBudgetMs
  );
  let attempts = 0;

  try {
    while (attempts < budgetedAttempts) {
      attempts += 1;

      const remainingMs = deadlineAt - Date.now();
      if (remainingMs <= 0) {
        return {
          ok: false,
          error: {
            code: ERROR_CODES.NAVER_CAPTURE_TIMEOUT,
            message: "Global request deadline exceeded before capture completed"
          },
          meta: {
            attempts,
            queueWaitMs
          }
        };
      }

      const attemptBudgetMs = getAttemptBudgetMs(
        remainingMs,
        budgetedAttempts - attempts + 1,
        minimumAttemptBudgetMs
      );
      const perAttemptOptions = clampCaptureOptionsToRemaining(captureOptions, attemptBudgetMs);
      const result = await withTimeout(
        captureProductPayloads(productUrl, perAttemptOptions),
        attemptBudgetMs
      );

      if (result === "timeout") {
        return {
          ok: false,
          error: {
            code: ERROR_CODES.NAVER_CAPTURE_TIMEOUT,
            message: "Global request deadline exceeded during capture"
          },
          meta: {
            attempts,
            queueWaitMs
          }
        };
      }

      if (result.ok) {
        return {
          ok: true,
          value: result.value,
          meta: {
            attempts,
            queueWaitMs
          }
        };
      }

      if (result.error.code !== ERROR_CODES.NAVER_CAPTURE_TIMEOUT) {
        return {
          ok: false,
          error: result.error,
          meta: {
            attempts,
            queueWaitMs
          }
        };
      }
    }

    return {
      ok: false,
      error: {
        code: ERROR_CODES.NAVER_CAPTURE_TIMEOUT,
        message: "Capture attempts exhausted before receiving product details"
      },
      meta: {
        attempts,
        queueWaitMs
      }
    };
  } finally {
    release();
  }
}

function clampCaptureOptionsToRemaining(
  options: CaptureOptions,
  remainingMs: number
): CaptureOptions {
  const boundedTimeout = Math.max(1000, Math.min(options.navigationTimeoutMs, remainingMs));

  return {
    ...options,
    navigationTimeoutMs: boundedTimeout,
    captureGraceMs: Math.max(300, Math.min(options.captureGraceMs, Math.floor(boundedTimeout * 0.8)))
  };
}

function getMinimumAttemptBudgetMs(options: CaptureOptions): number {
  return options.navigationTimeoutMs + options.captureGraceMs + 1000;
}

function getBudgetedAttemptCount(
  globalRequestTimeoutMs: number,
  maxAttempts: number,
  minimumAttemptBudgetMs: number
): number {
  return Math.max(1, Math.min(maxAttempts, Math.floor(globalRequestTimeoutMs / minimumAttemptBudgetMs)));
}

function getAttemptBudgetMs(
  remainingMs: number,
  attemptsRemaining: number,
  minimumAttemptBudgetMs: number
): number {
  return Math.max(minimumAttemptBudgetMs, Math.floor(remainingMs / attemptsRemaining));
}

async function withTimeout<T extends CaptureAttemptResult>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T | "timeout"> {
  let timeoutId: NodeJS.Timeout | null = null;

  const timeoutPromise = new Promise<"timeout">((resolve) => {
    timeoutId = setTimeout(() => {
      resolve("timeout");
    }, timeoutMs);
  });

  const result = await Promise.race([promise, timeoutPromise]);
  if (timeoutId) {
    clearTimeout(timeoutId);
  }

  return result;
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

export const requestOrchestrationInternalsForTest = {
  getMinimumAttemptBudgetMs,
  getBudgetedAttemptCount,
  getAttemptBudgetMs,
  clampCaptureOptionsToRemaining,
  withTimeout
};
