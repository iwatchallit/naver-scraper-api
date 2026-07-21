import { readFile } from "node:fs/promises";

export interface RequestSample {
  url: string;
  ok: boolean;
  status: number;
  latencyMs: number;
  errorCode: string | null;
}

export async function loadUrlList(filePath: string): Promise<string[]> {
  const raw = await readFile(filePath, "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

export async function callNaver(baseUrl: string, productUrl: string): Promise<RequestSample> {
  const startedAt = Date.now();
  const target = `${baseUrl}/naver?productUrl=${encodeURIComponent(productUrl)}`;

  const response = await fetch(target);
  const latencyMs = Date.now() - startedAt;

  let errorCode: string | null = null;
  try {
    const body = (await response.json()) as { error?: { code?: string } };
    errorCode = body.error?.code ?? null;
  } catch {
    errorCode = null;
  }

  return {
    url: productUrl,
    ok: response.ok,
    status: response.status,
    latencyMs,
    errorCode
  };
}

export function summarize(samples: RequestSample[]) {
  const total = samples.length;
  const failures = samples.filter((sample) => !sample.ok).length;
  const latencyAvg =
    total === 0 ? 0 : Math.round(samples.reduce((sum, sample) => sum + sample.latencyMs, 0) / total);

  const errorRatePct = total === 0 ? 0 : Number(((failures / total) * 100).toFixed(2));

  return {
    total,
    failures,
    success: total - failures,
    errorRatePct,
    latencyAvgMs: latencyAvg
  };
}
