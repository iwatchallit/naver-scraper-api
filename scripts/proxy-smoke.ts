import { spawn } from "node:child_process";

const targetUrl = process.env.PROXY_SMOKE_URL ?? "http://example.com";
const proxyServer = process.env.PROXY_SERVER;
const proxyUsername = normalizeOptionalString(process.env.PROXY_USERNAME);
const proxyPassword = normalizeOptionalString(process.env.PROXY_PASSWORD);

if (!proxyServer) {
  throw new Error("PROXY_SERVER must be set before running the proxy smoke test");
}

const proxyUrl = buildProxyUrl(proxyServer, proxyUsername, proxyPassword);

console.log(`[proxy-smoke] target ${targetUrl}`);
console.log(`[proxy-smoke] proxy ${redactProxyUrl(proxyUrl)}`);

const curlArgs = ["-sS", "-i", "-x", proxyUrl, targetUrl];
const curl = spawn("curl.exe", curlArgs, { stdio: ["ignore", "pipe", "pipe"] });

let stdout = "";
let stderr = "";

curl.stdout.on("data", (chunk) => {
  stdout += chunk.toString("utf8");
});

curl.stderr.on("data", (chunk) => {
  stderr += chunk.toString("utf8");
});

curl.on("close", (code) => {
  if (stdout.trim().length > 0) {
    console.log(stdout.trim());
  }

  if (stderr.trim().length > 0) {
    console.error(stderr.trim());
  }

  process.exit(code ?? 1);
});

function buildProxyUrl(server: string, username: string | null, password: string | null) {
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