import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";

const SMARTSTORE_REGEX = /https?:\/\/smartstore\.naver\.com\/([^\s"'?#/]+)\/products\/(\d+)/gi;
const BRAND_REGEX = /https?:\/\/brand\.naver\.com\/([^\s"'?#/]+)\/products\/(\d+)/gi;
const WINDOW_REGEX = /https?:\/\/shopping\.naver\.com\/window-products\/([^\s"'?#/]+)\/(\d+)/gi;
const SMARTSTORE_MAIN_REGEX = /https?:\/\/smartstore\.naver\.com\/main\/products\/(\d+)/gi;
const OUTFLOW_URL_REGEX = /https?:\/\/(?:smartstore|brand)\.naver\.com\/inflow\/outlink\/url\?url=([^\s"']+)/gi;

async function main() {
  const outputFile = process.env.CANDIDATE_URL_FILE ?? "testdata/corpus-candidates.txt";
  const includeSmartstoreMain = (process.env.CANDIDATE_INCLUDE_SMARTSTORE_MAIN ?? "false").toLowerCase() === "true";
  const includeGlobs = [
    ".playwright-mcp",
    "testdata"
  ];

  const files = await collectFiles(includeGlobs.map((value) => resolve(value)));
  const candidates = new Set<string>();

  for (const filePath of files) {
    const content = await safeReadUtf8(filePath);
    if (!content) {
      continue;
    }

    collectMatches(content, SMARTSTORE_REGEX, (match) => {
      const [, store, productId] = match;
      return `https://smartstore.naver.com/${store}/products/${productId}`;
    }, candidates);

    collectMatches(content, SMARTSTORE_MAIN_REGEX, (match) => {
      const [, productId] = match;
      return `https://smartstore.naver.com/main/products/${productId}`;
    }, candidates, includeSmartstoreMain);

    collectMatches(content, BRAND_REGEX, (match) => {
      const [, store, productId] = match;
      return `https://brand.naver.com/${store}/products/${productId}`;
    }, candidates);

    collectMatches(content, WINDOW_REGEX, (match) => {
      const [, store, productId] = match;
      return `https://shopping.naver.com/window-products/${store}/${productId}`;
    }, candidates);

    collectMatches(content, OUTFLOW_URL_REGEX, (match) => {
      const [, encoded] = match;
      const rawValue = encoded.split("&")[0] ?? encoded;

      try {
        return decodeURIComponent(rawValue);
      } catch {
        return "";
      }
    }, candidates);
  }

  const sorted = [...candidates].sort((a, b) => a.localeCompare(b));

  await mkdir(dirname(outputFile), { recursive: true });
  await writeFile(outputFile, renderFile(sorted), "utf8");

  process.stdout.write(
    `seeded candidate list: ${sorted.length} urls | output=${outputFile} | scannedFiles=${files.length}\n`
  );
}

function collectMatches(
  content: string,
  regex: RegExp,
  mapper: (match: RegExpExecArray) => string,
  out: Set<string>,
  enabled = true
) {
  if (!enabled) {
    return;
  }

  regex.lastIndex = 0;
  let match: RegExpExecArray | null = regex.exec(content);

  while (match) {
    const normalized = normalizeCandidateUrl(mapper(match));
    if (normalized) {
      out.add(normalized);
    }

    match = regex.exec(content);
  }
}

function normalizeCandidateUrl(rawUrl: string): string | null {
  if (!rawUrl) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  const host = parsed.hostname;
  const segments = parsed.pathname.split("/").filter(Boolean);

  if (host === "smartstore.naver.com" && segments.length === 3 && segments[1] === "products") {
    if (segments[0] === "main") {
      return null;
    }

    return `https://smartstore.naver.com/${segments[0]}/products/${segments[2]}`;
  }

  if (host === "brand.naver.com" && segments.length === 3 && segments[1] === "products") {
    return `https://brand.naver.com/${segments[0]}/products/${segments[2]}`;
  }

  if (host === "shopping.naver.com" && segments.length === 3 && segments[0] === "window-products") {
    return `https://shopping.naver.com/window-products/${segments[1]}/${segments[2]}`;
  }

  return null;
}

function renderFile(urls: string[]): string {
  const lines = [
    "# auto-generated corpus candidates",
    `# generated at ${new Date().toISOString()}`,
    ""
  ];

  lines.push(...urls);
  return lines.join("\n") + "\n";
}

async function collectFiles(roots: string[]): Promise<string[]> {
  const all: string[] = [];

  for (const root of roots) {
    await walk(root, all);
  }

  return all.filter((filePath) => {
    const ext = extname(filePath).toLowerCase();
    return ext === ".txt" || ext === ".yml" || ext === ".yaml" || ext === ".log" || ext === ".json";
  });
}

async function walk(dirPath: string, out: string[]) {
  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const nextPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await walk(nextPath, out);
      continue;
    }

    if (entry.isFile()) {
      out.push(nextPath);
    }
  }
}

async function safeReadUtf8(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
