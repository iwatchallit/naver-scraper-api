import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type JsonRecord = Record<string, unknown>;

function rootPath() {
  return path.resolve(process.cwd(), "artifacts", "submission");
}

async function readJson<T>(fileName: string): Promise<T> {
  const absolutePath = path.join(rootPath(), fileName);
  const raw = await readFile(absolutePath, "utf8");
  return JSON.parse(raw) as T;
}

async function writeJson(fileName: string, value: unknown) {
  const absolutePath = path.join(rootPath(), fileName);
  await writeFile(absolutePath, JSON.stringify(value, null, 2));
}

function asObject(value: unknown): JsonRecord {
  if (!value || typeof value !== "object") {
    return {};
  }

  return value as JsonRecord;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

async function main() {
  const gateStatus = await readJson<JsonRecord>("gate-status.json");

  const gates = asObject(gateStatus.gates);
  const security = asObject(gates.security);
  const anti = asObject(gates["anti-detection"]);
  const performance = asObject(gates.performance);
  const documentation = asObject(gates.documentation);

  const baseline = await readJson<JsonRecord>("baseline-report.json");
  const corpus = await readJson<JsonRecord>("corpus-report.json");
  const soak = await readJson<JsonRecord>("soak-report.json");
  const antiFingerprint = await readJson<JsonRecord>("anti-fingerprint-rotation.json");
  const antiIp = await readJson<JsonRecord>("anti-ip-behavior.json");
  const antiJitter = await readJson<JsonRecord>("anti-throttle-jitter.json");
  const publicSmoke = await readJson<JsonRecord>("public-smoke.json");
  const externalPorts = await readJson<JsonRecord>("external-port-exposure.json");
  const secretScan = await readJson<JsonRecord>("secret-scan-report.json");
  const docAttestation = await readJson<JsonRecord>("documentation-attestation.json");

  const generatedAt = new Date().toISOString();

  const externalSummary = asObject(externalPorts.summary);
  const secretSummary = asObject(secretScan.summary);
  const fpSummary = asObject(antiFingerprint.summary);
  const ipSummary = asObject(antiIp.summary);
  const jitterSummary = asObject(antiJitter.summary);
  const baselineSummary = asObject(baseline.summary);
  const corpusSummary = asObject(corpus.summary);
  const soakSummary = asObject(soak.summary);
  const smokeSummary = asObject(publicSmoke.summary);
  const docSummary = asObject(docAttestation.summary);

  const securityExternal = asObject(security.externalPortExposure);
  securityExternal.measured = {
    publicApiReachable: asBoolean(externalSummary.publicApiReachable),
    cdp9222PubliclyReachable: asBoolean(externalSummary.cdp9222PubliclyReachable),
    redisPubliclyReachable: asBoolean(externalSummary.redisPubliclyReachable)
  };
  securityExternal.pass =
    asBoolean(externalSummary.publicApiReachable) &&
    !asBoolean(externalSummary.cdp9222PubliclyReachable) &&
    !asBoolean(externalSummary.redisPubliclyReachable);
  securityExternal.timestamp = generatedAt;
  security.externalPortExposure = securityExternal;

  const securitySecret = asObject(security.secretScan);
  securitySecret.measured = {
    realSecretFindings: asNumber(secretSummary.realSecretFindings, 0),
    manualReviewCompleted: asBoolean(secretSummary.manualReviewCompleted)
  };
  securitySecret.pass =
    asNumber(secretSummary.realSecretFindings, 0) <= 0 && asBoolean(secretSummary.manualReviewCompleted);
  securitySecret.timestamp = generatedAt;
  security.secretScan = securitySecret;

  const antiFingerprintGate = asObject(anti.fingerprintRotation);
  antiFingerprintGate.measured = {
    distinctProfiles: asNumber(fpSummary.distinctProfiles, 0),
    baselineRequestCount: asNumber(fpSummary.baselineRequestCount, 0)
  };
  antiFingerprintGate.pass =
    asNumber(fpSummary.distinctProfiles, 0) >= 3 && asNumber(fpSummary.baselineRequestCount, 0) >= 100;
  antiFingerprintGate.timestamp = generatedAt;
  anti.fingerprintRotation = antiFingerprintGate;

  const antiIpGate = asObject(anti.ipBehavior);
  const rotationObserved = asNumber(ipSummary.rotationObserved, 0);
  const stickyStable = asBoolean(ipSummary.stickySessionStableForSoak, false);
  const ipErrorRate = asNumber(ipSummary.errorRatePct, 100);
  antiIpGate.measured = {
    mode: typeof ipSummary.mode === "string" ? ipSummary.mode : "unknown",
    rotationObserved,
    stickySessionStableForSoak: stickyStable,
    errorRatePct: ipErrorRate
  };
  antiIpGate.pass = (rotationObserved >= 2 || stickyStable) && ipErrorRate <= 5;
  antiIpGate.timestamp = generatedAt;
  anti.ipBehavior = antiIpGate;

  const antiJitterGate = asObject(anti.throttlingJitter);
  const delayMinMs = asNumber(jitterSummary.delayMinMs, 0);
  const delayMaxMs = asNumber(jitterSummary.delayMaxMs, 0);
  const jitterViolations = asNumber(jitterSummary.violations, 0);
  antiJitterGate.measured = {
    delayMinMs,
    delayMaxMs,
    violations: jitterViolations
  };
  antiJitterGate.pass = delayMinMs >= 150 && delayMaxMs <= 900 && jitterViolations === 0;
  antiJitterGate.timestamp = generatedAt;
  anti.throttlingJitter = antiJitterGate;

  const baselineGate = asObject(performance.baseline);
  const baselineLatency = asNumber(baselineSummary.latencyAvgMs, 0);
  const baselineError = asNumber(baselineSummary.errorRatePct, 100);
  baselineGate.measured = {
    latencyAvgMs: baselineLatency,
    errorRatePct: baselineError
  };
  baselineGate.pass = baselineLatency <= 6000 && baselineError <= 5;
  baselineGate.timestamp = generatedAt;
  performance.baseline = baselineGate;

  const corpusGate = asObject(performance.corpus);
  const uniqueProducts = asNumber(corpusSummary.uniqueProducts, asNumber(corpusSummary.uniqueUrls, 0));
  corpusGate.measured = {
    uniqueProducts
  };
  corpusGate.pass = uniqueProducts >= 1000;
  corpusGate.timestamp = generatedAt;
  performance.corpus = corpusGate;

  const soakGate = asObject(performance.soak);
  const soakDuration = asNumber(soakSummary.durationSec, 0);
  const soakErrorRate = asNumber(soakSummary.errorRatePct, 100);
  const soakReadyFailure = asNumber(soakSummary.longestConsecutiveReadyFailureSec, 0);
  const soakMemoryGrowth = asNumber(soakSummary.memoryGrowthPct, 0);
  const soakTailSlope = asNumber(soakSummary.tailSlopeBytesPerMin, 0);
  soakGate.measured = {
    durationSec: soakDuration,
    errorRatePct: soakErrorRate,
    longestConsecutiveReadyFailureSec: soakReadyFailure,
    memoryGrowthPct: soakMemoryGrowth,
    tailSlopeBytesPerMin: soakTailSlope
  };
  soakGate.pass =
    soakDuration >= 3600 &&
    soakErrorRate <= 5 &&
    soakReadyFailure <= 119 &&
    soakMemoryGrowth <= 25 &&
    soakTailSlope <= 0;
  soakGate.timestamp = generatedAt;
  performance.soak = soakGate;

  const smokeGate = asObject(documentation.publicSmoke);
  const readyPass = asBoolean(smokeSummary.readyPass, false);
  const naverPassAll = asBoolean(smokeSummary.naverPassAll, false);
  const smokeUrlsCount = asNumber(smokeSummary.smokeUrlsCount, 0);
  smokeGate.measured = {
    readyPass,
    naverPassAll,
    smokeUrlsCount
  };
  smokeGate.pass = readyPass && naverPassAll && smokeUrlsCount >= 10;
  smokeGate.timestamp = generatedAt;
  documentation.publicSmoke = smokeGate;

  const docsGate = asObject(documentation.documentationAttestation);
  const readmeUpdated = asBoolean(docSummary.readmeUpdated, false);
  const deploymentDocsUpdated = asBoolean(docSummary.deploymentDocsUpdated, false);
  const benchmarkSummaryUpdated = asBoolean(docSummary.benchmarkSummaryUpdated, false);
  docsGate.measured = {
    readmeUpdated,
    deploymentDocsUpdated,
    benchmarkSummaryUpdated
  };
  docsGate.pass = readmeUpdated && deploymentDocsUpdated && benchmarkSummaryUpdated;
  docsGate.timestamp = generatedAt;
  documentation.documentationAttestation = docsGate;

  gates.security = security;
  gates["anti-detection"] = anti;
  gates.performance = performance;
  gates.documentation = documentation;
  gateStatus.gates = gates;

  const policy = asObject(gateStatus.policy);
  policy.generatedAt = generatedAt;
  gateStatus.policy = policy;

  await writeJson("gate-status.json", gateStatus);
  console.log("[submission:sync-gates] updated gate-status.json from submission artifact evidence files");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
