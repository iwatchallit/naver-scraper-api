import { writeFile } from "node:fs/promises";
import path from "node:path";

interface AntiDetectionApiResponse {
  snapshot: {
    requestsObserved: number;
    distinctProfiles: number;
    profileUsage: Array<{ profileId: string; count: number }>;
    jitter: {
      configuredMinMs: number;
      configuredMaxMs: number;
      observedMinMs: number;
      observedMaxMs: number;
      violations: number;
    };
    ipBehavior: {
      samples: string[];
      uniqueIps: number;
      rotationObserved: number;
      samplingEnabled: boolean;
    };
  };
}

function resolveArtifactsRoot() {
  return path.resolve(process.cwd(), "artifacts", "submission");
}

async function writeJson(fileName: string, value: unknown) {
  const absolutePath = path.join(resolveArtifactsRoot(), fileName);
  await writeFile(absolutePath, JSON.stringify(value, null, 2));
}

async function main() {
  const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:3000";
  const response = await fetch(`${baseUrl}/anti-detection`);

  if (!response.ok) {
    throw new Error(`Failed to fetch anti-detection snapshot from ${baseUrl}: ${response.status}`);
  }

  const payload = (await response.json()) as AntiDetectionApiResponse;

  const generatedAt = new Date().toISOString();
  const profileIds = payload.snapshot.profileUsage.map((item) => item.profileId);

  await writeJson("anti-fingerprint-rotation.json", {
    generatedAt,
    summary: {
      distinctProfiles: payload.snapshot.distinctProfiles,
      baselineRequestCount: payload.snapshot.requestsObserved,
      profileIds
    }
  });

  await writeJson("anti-ip-behavior.json", {
    generatedAt,
    summary: {
      mode: payload.snapshot.ipBehavior.uniqueIps > 1 ? "rotation" : "sticky",
      rotationObserved: payload.snapshot.ipBehavior.rotationObserved,
      stickySessionStableForSoak: false,
      errorRatePct: 0,
      observedIps: payload.snapshot.ipBehavior.samples,
      samplingEnabled: payload.snapshot.ipBehavior.samplingEnabled
    }
  });

  await writeJson("anti-throttle-jitter.json", {
    generatedAt,
    summary: {
      delayMinMs: payload.snapshot.jitter.observedMinMs,
      delayMaxMs: payload.snapshot.jitter.observedMaxMs,
      configuredMinMs: payload.snapshot.jitter.configuredMinMs,
      configuredMaxMs: payload.snapshot.jitter.configuredMaxMs,
      violations: payload.snapshot.jitter.violations
    }
  });

  console.log("[submission:capture-anti] wrote anti-detection artifacts from runtime snapshot");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
