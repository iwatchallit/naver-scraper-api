import test from "node:test";
import assert from "node:assert/strict";
import { requestOrchestrationInternalsForTest } from "../../src/services/request-orchestrator";
import type { CaptureOptions } from "../../src/services/naver-cdp";

const captureOptions: Pick<CaptureOptions, "navigationTimeoutMs" | "captureGraceMs"> = {
  navigationTimeoutMs: 8000,
  captureGraceMs: 4000
};

test("route budget keeps room for one retry", () => {
  const minimumAttemptBudgetMs = requestOrchestrationInternalsForTest.getMinimumAttemptBudgetMs(
    captureOptions as CaptureOptions
  );

  assert.equal(minimumAttemptBudgetMs, 13000);
  assert.equal(
    requestOrchestrationInternalsForTest.getBudgetedAttemptCount(30000, 4, minimumAttemptBudgetMs),
    2
  );
  assert.equal(
    requestOrchestrationInternalsForTest.getAttemptBudgetMs(30000, 2, minimumAttemptBudgetMs),
    15000
  );
});