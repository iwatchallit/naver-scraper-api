import { callNaver, loadUrlList, summarize, type RequestSample } from "./shared";

async function readResidentMemoryBytes(baseUrl: string): Promise<number | null> {
  const response = await fetch(`${baseUrl}/metrics`);
  if (!response.ok) {
    return null;
  }

  const text = await response.text();
  const line = text
    .split(/\r?\n/)
    .find((value) => value.startsWith("process_resident_memory_bytes "));

  if (!line) {
    return null;
  }

  const value = Number.parseFloat(line.split(" ")[1] ?? "NaN");
  return Number.isNaN(value) ? null : value;
}

async function main() {
  const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:3000";
  const filePath = process.env.SOAK_URL_FILE ?? "testdata/soak-urls.txt";
  const durationSec = Number.parseInt(process.env.SOAK_DURATION_SEC ?? "3600", 10);
  const intervalMs = Number.parseInt(process.env.SOAK_INTERVAL_MS ?? "1500", 10);

  const urls = await loadUrlList(filePath);
  if (urls.length === 0) {
    throw new Error("Soak run requires at least one URL in SOAK_URL_FILE");
  }

  const startedAt = Date.now();
  const endsAt = startedAt + durationSec * 1000;
  const samples: RequestSample[] = [];
  const memorySamples: number[] = [];
  let readyFailures = 0;

  while (Date.now() < endsAt) {
    const url = urls[samples.length % urls.length];

    const ready = await fetch(`${baseUrl}/ready`);
    if (!ready.ok) {
      readyFailures += 1;
    }

    const sample = await callNaver(baseUrl, url);
    samples.push(sample);

    const memory = await readResidentMemoryBytes(baseUrl);
    if (memory !== null) {
      memorySamples.push(memory);
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  const summary = summarize(samples);
  const memoryStart = memorySamples.length > 0 ? memorySamples[0] : null;
  const memoryEnd = memorySamples.length > 0 ? memorySamples[memorySamples.length - 1] : null;

  console.log(
    JSON.stringify(
      {
        mode: "soak",
        baseUrl,
        durationSec,
        intervalMs,
        requests: summary,
        readyFailures,
        memory: {
          samples: memorySamples.length,
          startBytes: memoryStart,
          endBytes: memoryEnd,
          growthBytes:
            memoryStart !== null && memoryEnd !== null ? Math.max(0, memoryEnd - memoryStart) : null
        }
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
