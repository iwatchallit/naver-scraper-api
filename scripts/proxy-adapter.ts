import { anonymizeProxy, closeAnonymizedProxy } from "proxy-chain";

const upstreamProxyServer = process.env.PROXY_SERVER;
const upstreamProxyUsername = normalizeOptionalString(process.env.PROXY_USERNAME);
const upstreamProxyPassword = normalizeOptionalString(process.env.PROXY_PASSWORD);
const listenPort = toPositiveInt(process.env.PROXY_ADAPTER_PORT, 8899);

if (!upstreamProxyServer) {
  throw new Error("PROXY_SERVER must be set for the local proxy adapter to start");
}

const upstreamUrl = buildUpstreamUrl(upstreamProxyServer, upstreamProxyUsername, upstreamProxyPassword);

void startAdapter();

async function startAdapter() {
  const localProxyUrl = await anonymizeProxy({
    url: upstreamUrl,
    port: listenPort
  });

  console.log(`[proxy-adapter] listening on ${localProxyUrl}`);
  console.log(`[proxy-adapter] upstream ${redactProxyUrl(upstreamUrl)}`);

  const shutdown = async () => {
    try {
      await closeAnonymizedProxy(localProxyUrl, true);
    } catch {
      // Ignore shutdown errors.
    }
  };

  process.on("SIGINT", async () => {
    await shutdown();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await shutdown();
    process.exit(0);
  });
}

function buildUpstreamUrl(server: string, username: string | null, password: string | null) {
  const parsed = new URL(server);
  if (username) {
    parsed.username = username;
  }

  if (password) {
    parsed.password = password;
  }

  return parsed.toString();
}

function redactProxyUrl(rawValue: string): string {
  const parsed = new URL(rawValue);
  if (parsed.username || parsed.password) {
    parsed.username = "[REDACTED]";
    parsed.password = "[REDACTED]";
  }

  return parsed.toString();
}

function normalizeOptionalString(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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