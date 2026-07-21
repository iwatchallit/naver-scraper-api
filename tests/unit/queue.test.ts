import test from "node:test";
import assert from "node:assert/strict";
import { WorkerPoolQueue } from "../../src/services/request-orchestrator";

test("queue enforces pending count and release flow", async () => {
  const queue = new WorkerPoolQueue(1);

  const releaseA = await queue.acquire(10, 1000);
  const acquireB = queue.acquire(10, 1000);
  assert.equal(queue.pending(), 1);

  releaseA();
  const releaseB = await acquireB;
  assert.equal(queue.pending(), 0);
  releaseB();
});

test("queue wait timeout rejects when worker unavailable", async () => {
  const queue = new WorkerPoolQueue(1);
  const release = await queue.acquire(10, 1000);

  await assert.rejects(async () => {
    await queue.acquire(10, 30);
  });

  release();
});
