import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { callNaver, loadUrlList } from "./shared";

interface TriageResult {
  url: string;
  ok: boolean;
  status: number;
  latencyMs: number;
  errorCode: string | null;
  bucket: string;
}

const STALE_CODES = new Set(["NAVER_TARGET_UNAVAILABLE", "NAVER_INVALID_URL"]);
const CHALLENGE_CODES = new Set(["NAVER_UPSTREAM_CHALLENGE"]);
const INFRA_CODES = new Set([
  "NAVER_SIDECAR_UNAVAILABLE",
  "NAVER_PROXY_UNAVAILABLE",
  "NAVER_PROXY_AUTH_FAILED"
]);

async function main() {
  const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:3000";
  const inputFile = process.env.CORPUS_URL_FILE ?? "testdata/corpus-urls.txt";
  const reportFile = process.env.TRIAGE_REPORT_FILE ?? "artifacts/corpus-triage/report.json";
  const liveFile = process.env.TRIAGE_LIVE_FILE ?? "testdata/corpus-urls.live.txt";
  const staleFile = process.env.TRIAGE_STALE_FILE ?? "testdata/corpus-urls.stale.txt";
  const concurrency = Math.max(1, Number.parseInt(process.env.TRIAGE_CONCURRENCY ?? "3", 10) || 3);

  const urls = await loadUrlList(inputFile);
  const results = await runWithConcurrency(urls, concurrency, async (url) => {
    try {
      const sample = await callNaver(baseUrl, url);
      return {
        ...sample,
        bucket: classify(sample.ok, sample.errorCode)
      } satisfies TriageResult;
    } catch {
      return {
        url,
        ok: false,
        status: 0,
        latencyMs: 0,
        errorCode: "REQUEST_FAILED",
        bucket: "infra"
      } satisfies TriageResult;
    }
  });

  const grouped = groupByBucket(results);
  const liveUrls = grouped.live.map((item) => item.url);

  await ensureParent(reportFile);
  await writeFile(
    reportFile,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        baseUrl,
        inputFile,
        totals: {
          all: results.length,
          live: grouped.live.length,
          stale: grouped.stale.length,
          challenge: grouped.challenge.length,
          timeout: grouped.timeout.length,
          infra: grouped.infra.length,
          other: grouped.other.length
        },
        buckets: grouped,
        notes: [
          "live: success responses that are safe to keep in benchmark/challenge lists",
          "stale: unavailable/suspended/invalid targets",
          "challenge: upstream anti-bot challenge pages",
          "timeout: scraper did not capture product details within budget",
          "infra: sidecar/proxy/request transport failures"
        ]
      },
      null,
      2
    ),
    "utf8"
  );

  await ensureParent(liveFile);
  await writeFile(liveFile, renderUrlFile("live targets", liveUrls), "utf8");

  await ensureParent(staleFile);
  await writeFile(staleFile, renderStaleFile(grouped), "utf8");

  process.stdout.write(
    [
      `triage complete: ${results.length} urls`,
      `live=${grouped.live.length}`,
      `stale=${grouped.stale.length}`,
      `challenge=${grouped.challenge.length}`,
      `timeout=${grouped.timeout.length}`,
      `infra=${grouped.infra.length}`,
      `other=${grouped.other.length}`,
      `report=${reportFile}`,
      `liveFile=${liveFile}`,
      `staleFile=${staleFile}`
    ].join(" | ") + "\n"
  );
}

function classify(ok: boolean, errorCode: string | null): string {
  if (ok) {
    return "live";
  }

  if (!errorCode) {
    return "other";
  }

  if (STALE_CODES.has(errorCode)) {
    return "stale";
  }

  if (CHALLENGE_CODES.has(errorCode)) {
    return "challenge";
  }

  if (errorCode === "NAVER_CAPTURE_TIMEOUT") {
    return "timeout";
  }

  if (INFRA_CODES.has(errorCode) || errorCode === "REQUEST_FAILED") {
    return "infra";
  }

  return "other";
}

function groupByBucket(results: TriageResult[]) {
  const grouped: Record<string, TriageResult[]> = {
    live: [],
    stale: [],
    challenge: [],
    timeout: [],
    infra: [],
    other: []
  };

  for (const item of results) {
    grouped[item.bucket]?.push(item);
  }

  return grouped as {
    live: TriageResult[];
    stale: TriageResult[];
    challenge: TriageResult[];
    timeout: TriageResult[];
    infra: TriageResult[];
    other: TriageResult[];
  };
}

async function runWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        break;
      }

      results[index] = await worker(items[index]);
    }
  });

  await Promise.all(runners);
  return results;
}

function renderUrlFile(title: string, urls: string[]): string {
  const lines = [`# ${title}`, `# generated at ${new Date().toISOString()}`, ""];
  lines.push(...urls);
  return lines.join("\n") + "\n";
}

function renderStaleFile(grouped: {
  stale: TriageResult[];
  challenge: TriageResult[];
  timeout: TriageResult[];
  infra: TriageResult[];
  other: TriageResult[];
}): string {
  const lines: string[] = [
    "# non-live targets",
    `# generated at ${new Date().toISOString()}`,
    ""
  ];

  appendBucket(lines, "stale", grouped.stale);
  appendBucket(lines, "challenge", grouped.challenge);
  appendBucket(lines, "timeout", grouped.timeout);
  appendBucket(lines, "infra", grouped.infra);
  appendBucket(lines, "other", grouped.other);

  return lines.join("\n") + "\n";
}

function appendBucket(lines: string[], label: string, items: TriageResult[]) {
  lines.push(`# ${label}: ${items.length}`);
  for (const item of items) {
    lines.push(`${item.url} # code=${item.errorCode ?? "none"} status=${item.status}`);
  }
  lines.push("");
}

async function ensureParent(filePath: string) {
  await mkdir(dirname(filePath), { recursive: true });
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
