import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

interface GateCheckItem {
  pass: boolean;
  evidenceFile: string;
}

interface GateStatus {
  version: number;
  policy: {
    noManualOverride: boolean;
    failFastOrder: string[];
    generatedAt: string;
  };
  gates: {
    security: {
      externalPortExposure: GateCheckItem & {
        required: {
          publicApiReachable: boolean;
          cdp9222PubliclyReachable: boolean;
          redisPubliclyReachable: boolean;
        };
        measured: {
          publicApiReachable: boolean;
          cdp9222PubliclyReachable: boolean;
          redisPubliclyReachable: boolean;
        };
      };
      secretScan: GateCheckItem & {
        required: {
          realSecretFindings: number;
          manualReviewCompleted: boolean;
        };
        measured: {
          realSecretFindings: number;
          manualReviewCompleted: boolean;
        };
      };
    };
    "anti-detection": {
      fingerprintRotation: GateCheckItem & {
        required: {
          distinctProfilesMin: number;
          baselineRequestCountMin: number;
        };
        measured: {
          distinctProfiles: number;
          baselineRequestCount: number;
        };
      };
      ipBehavior: GateCheckItem & {
        required: {
          mode: string;
          rotationObservedMin: number;
          stickySessionStableForSoak: boolean;
        };
        measured: {
          mode: string;
          rotationObserved: number;
          stickySessionStableForSoak: boolean;
          errorRatePct: number;
        };
      };
      throttlingJitter: GateCheckItem & {
        required: {
          delayMinMs: number;
          delayMaxMs: number;
          violationsMax: number;
        };
        measured: {
          delayMinMs: number;
          delayMaxMs: number;
          violations: number;
        };
      };
    };
    performance: {
      baseline: GateCheckItem & {
        required: {
          latencyAvgMsMax: number;
          errorRatePctMax: number;
        };
        measured: {
          latencyAvgMs: number;
          errorRatePct: number;
        };
      };
      corpus: GateCheckItem & {
        required: {
          uniqueProductsMin: number;
        };
        measured: {
          uniqueProducts: number;
        };
      };
      soak: GateCheckItem & {
        required: {
          durationSecMin: number;
          errorRatePctMax: number;
          longestConsecutiveReadyFailureSecMax: number;
          memoryGrowthPctMax: number;
          tailSlopeBytesPerMinMax: number;
        };
        measured: {
          durationSec: number;
          errorRatePct: number;
          longestConsecutiveReadyFailureSec: number;
          memoryGrowthPct: number;
          tailSlopeBytesPerMin: number;
        };
      };
    };
    documentation: {
      publicSmoke: GateCheckItem & {
        required: {
          readyPass: boolean;
          naverPassAll: boolean;
          smokeUrlsCountMin: number;
        };
        measured: {
          readyPass: boolean;
          naverPassAll: boolean;
          smokeUrlsCount: number;
        };
      };
      documentationAttestation: GateCheckItem & {
        required: {
          readmeUpdated: boolean;
          deploymentDocsUpdated: boolean;
          benchmarkSummaryUpdated: boolean;
        };
        measured: {
          readmeUpdated: boolean;
          deploymentDocsUpdated: boolean;
          benchmarkSummaryUpdated: boolean;
        };
      };
    };
  };
}

const submissionRoot = path.resolve(process.cwd(), "artifacts", "submission");
const gateStatusPath = path.join(submissionRoot, "gate-status.json");

const requiredArtifactFiles = [
  "gate-status.json",
  "baseline-report.json",
  "corpus-report.json",
  "soak-report.json",
  "anti-fingerprint-rotation.json",
  "anti-ip-behavior.json",
  "anti-throttle-jitter.json",
  "public-smoke.json",
  "external-port-exposure.json",
  "secret-scan-report.json",
  "documentation-attestation.json"
] as const;

function fail(message: string): never {
  console.error(`[submission:check] FAIL: ${message}`);
  process.exit(1);
}

function readGateStatus(): GateStatus {
  if (!existsSync(gateStatusPath)) {
    fail(`Missing required manifest file: ${gateStatusPath}`);
  }

  try {
    const raw = readFileSync(gateStatusPath, "utf8");
    return JSON.parse(raw) as GateStatus;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown parse error";
    fail(`Unable to parse manifest at ${gateStatusPath}: ${reason}`);
  }
}

function checkRequiredFiles() {
  for (const fileName of requiredArtifactFiles) {
    const absolutePath = path.join(submissionRoot, fileName);
    if (!existsSync(absolutePath)) {
      fail(`Missing required artifact file: ${absolutePath}`);
    }
  }
}

function checkPolicy(status: GateStatus) {
  if (!status.policy.noManualOverride) {
    fail("noManualOverride must be true");
  }

  const expectedOrder = ["security", "anti-detection", "performance", "documentation"];
  if (status.policy.failFastOrder.join(",") !== expectedOrder.join(",")) {
    fail(`failFastOrder must be exactly: ${expectedOrder.join(" -> ")}`);
  }
}

function checkEvidenceFileExists(fileName: string, gateName: string) {
  const absolutePath = path.join(submissionRoot, fileName);
  if (!existsSync(absolutePath)) {
    fail(`Gate '${gateName}' references missing evidence file: ${absolutePath}`);
  }
}

function checkSecurity(status: GateStatus) {
  const gate = status.gates.security.externalPortExposure;
  checkEvidenceFileExists(gate.evidenceFile, "security.externalPortExposure");

  if (gate.measured.publicApiReachable !== gate.required.publicApiReachable) {
    fail("security.externalPortExposure: public API reachability requirement not met");
  }

  if (gate.measured.cdp9222PubliclyReachable !== gate.required.cdp9222PubliclyReachable) {
    fail("security.externalPortExposure: CDP 9222 exposure requirement not met");
  }

  if (gate.measured.redisPubliclyReachable !== gate.required.redisPubliclyReachable) {
    fail("security.externalPortExposure: Redis exposure requirement not met");
  }

  if (!gate.pass) {
    fail("security.externalPortExposure gate is marked failed");
  }

  const secretScan = status.gates.security.secretScan;
  checkEvidenceFileExists(secretScan.evidenceFile, "security.secretScan");

  if (secretScan.measured.realSecretFindings > secretScan.required.realSecretFindings) {
    fail("security.secretScan: realSecretFindings exceeds allowed maximum");
  }

  if (secretScan.measured.manualReviewCompleted !== secretScan.required.manualReviewCompleted) {
    fail("security.secretScan: manual review not completed");
  }

  if (!secretScan.pass) {
    fail("security.secretScan gate is marked failed");
  }
}

function checkAntiDetection(status: GateStatus) {
  const fingerprint = status.gates["anti-detection"].fingerprintRotation;
  checkEvidenceFileExists(fingerprint.evidenceFile, "anti-detection.fingerprintRotation");

  if (fingerprint.measured.distinctProfiles < fingerprint.required.distinctProfilesMin) {
    fail("anti-detection.fingerprintRotation: distinctProfiles below minimum");
  }

  if (fingerprint.measured.baselineRequestCount < fingerprint.required.baselineRequestCountMin) {
    fail("anti-detection.fingerprintRotation: baselineRequestCount below minimum");
  }

  if (!fingerprint.pass) {
    fail("anti-detection.fingerprintRotation gate is marked failed");
  }

  const ipBehavior = status.gates["anti-detection"].ipBehavior;
  checkEvidenceFileExists(ipBehavior.evidenceFile, "anti-detection.ipBehavior");

  const rotationPass = ipBehavior.measured.rotationObserved >= ipBehavior.required.rotationObservedMin;
  const stickyPass = ipBehavior.measured.stickySessionStableForSoak;

  if (!(rotationPass || stickyPass)) {
    fail("anti-detection.ipBehavior: neither rotation nor sticky-session requirement is satisfied");
  }

  if (ipBehavior.measured.errorRatePct > 5) {
    fail("anti-detection.ipBehavior: errorRatePct exceeds 5% guardrail");
  }

  if (!ipBehavior.pass) {
    fail("anti-detection.ipBehavior gate is marked failed");
  }

  const jitter = status.gates["anti-detection"].throttlingJitter;
  checkEvidenceFileExists(jitter.evidenceFile, "anti-detection.throttlingJitter");

  if (jitter.measured.delayMinMs < jitter.required.delayMinMs) {
    fail("anti-detection.throttlingJitter: measured delayMinMs below required minimum");
  }

  if (jitter.measured.delayMaxMs > jitter.required.delayMaxMs) {
    fail("anti-detection.throttlingJitter: measured delayMaxMs above required maximum");
  }

  if (jitter.measured.violations > jitter.required.violationsMax) {
    fail("anti-detection.throttlingJitter: violations above allowed maximum");
  }

  if (!jitter.pass) {
    fail("anti-detection.throttlingJitter gate is marked failed");
  }
}

function checkPerformance(status: GateStatus) {
  const baseline = status.gates.performance.baseline;
  checkEvidenceFileExists(baseline.evidenceFile, "performance.baseline");

  if (baseline.measured.latencyAvgMs > baseline.required.latencyAvgMsMax) {
    fail("performance.baseline: latencyAvgMs exceeds maximum");
  }

  if (baseline.measured.errorRatePct > baseline.required.errorRatePctMax) {
    fail("performance.baseline: errorRatePct exceeds maximum");
  }

  if (!baseline.pass) {
    fail("performance.baseline gate is marked failed");
  }

  const corpus = status.gates.performance.corpus;
  checkEvidenceFileExists(corpus.evidenceFile, "performance.corpus");

  if (corpus.measured.uniqueProducts < corpus.required.uniqueProductsMin) {
    fail("performance.corpus: uniqueProducts below minimum");
  }

  if (!corpus.pass) {
    fail("performance.corpus gate is marked failed");
  }

  const soak = status.gates.performance.soak;
  checkEvidenceFileExists(soak.evidenceFile, "performance.soak");

  if (soak.measured.durationSec < soak.required.durationSecMin) {
    fail("performance.soak: durationSec below minimum");
  }

  if (soak.measured.errorRatePct > soak.required.errorRatePctMax) {
    fail("performance.soak: errorRatePct exceeds maximum");
  }

  if (soak.measured.longestConsecutiveReadyFailureSec > soak.required.longestConsecutiveReadyFailureSecMax) {
    fail("performance.soak: longestConsecutiveReadyFailureSec exceeds maximum");
  }

  if (soak.measured.memoryGrowthPct > soak.required.memoryGrowthPctMax) {
    fail("performance.soak: memoryGrowthPct exceeds maximum");
  }

  if (soak.measured.tailSlopeBytesPerMin > soak.required.tailSlopeBytesPerMinMax) {
    fail("performance.soak: tailSlopeBytesPerMin exceeds maximum");
  }

  if (!soak.pass) {
    fail("performance.soak gate is marked failed");
  }
}

function checkDocumentation(status: GateStatus) {
  const smoke = status.gates.documentation.publicSmoke;
  checkEvidenceFileExists(smoke.evidenceFile, "documentation.publicSmoke");

  if (smoke.measured.readyPass !== smoke.required.readyPass) {
    fail("documentation.publicSmoke: /ready smoke result does not satisfy requirement");
  }

  if (smoke.measured.naverPassAll !== smoke.required.naverPassAll) {
    fail("documentation.publicSmoke: /naver smoke results do not satisfy requirement");
  }

  if (smoke.measured.smokeUrlsCount < smoke.required.smokeUrlsCountMin) {
    fail("documentation.publicSmoke: smokeUrlsCount below minimum");
  }

  if (!smoke.pass) {
    fail("documentation.publicSmoke gate is marked failed");
  }

  const attestation = status.gates.documentation.documentationAttestation;
  checkEvidenceFileExists(attestation.evidenceFile, "documentation.documentationAttestation");

  if (attestation.measured.readmeUpdated !== attestation.required.readmeUpdated) {
    fail("documentation.documentationAttestation: README update requirement not met");
  }

  if (attestation.measured.deploymentDocsUpdated !== attestation.required.deploymentDocsUpdated) {
    fail("documentation.documentationAttestation: deployment docs requirement not met");
  }

  if (attestation.measured.benchmarkSummaryUpdated !== attestation.required.benchmarkSummaryUpdated) {
    fail("documentation.documentationAttestation: benchmark summary requirement not met");
  }

  if (!attestation.pass) {
    fail("documentation.documentationAttestation gate is marked failed");
  }
}

function main() {
  checkRequiredFiles();
  const status = readGateStatus();
  checkPolicy(status);

  for (const stage of status.policy.failFastOrder) {
    if (stage === "security") {
      checkSecurity(status);
      continue;
    }

    if (stage === "anti-detection") {
      checkAntiDetection(status);
      continue;
    }

    if (stage === "performance") {
      checkPerformance(status);
      continue;
    }

    if (stage === "documentation") {
      checkDocumentation(status);
      continue;
    }

    fail(`Unknown gate stage in failFastOrder: ${stage}`);
  }

  console.log("[submission:check] PASS: all mandatory no-override gates are satisfied");
}

main();
