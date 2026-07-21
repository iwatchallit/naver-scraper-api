import type { NaverCaptureResult } from "../domain/capture";

interface CacheEntry {
  value: NaverCaptureResult;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export function getCacheTtlMsFromEnv(): number {
  return toPositiveInt(process.env.CACHE_TTL_MS, 60000);
}

export function getCachedCapture(cacheKey: string): NaverCaptureResult | null {
  const entry = cache.get(cacheKey);
  if (!entry) {
    return null;
  }

  if (Date.now() >= entry.expiresAt) {
    cache.delete(cacheKey);
    return null;
  }

  return entry.value;
}

export function setCachedCapture(cacheKey: string, value: NaverCaptureResult): void {
  const ttlMs = getCacheTtlMsFromEnv();
  cache.set(cacheKey, {
    value,
    expiresAt: Date.now() + ttlMs
  });
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
