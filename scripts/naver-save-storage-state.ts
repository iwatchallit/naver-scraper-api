import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { chromium } from "playwright-core";

async function main() {
  const cdpUrl = process.env.CDP_URL ?? "http://127.0.0.1:9222";
  const targetUrl = process.env.NAVER_LOGIN_URL ?? "https://nid.naver.com/nidlogin.login";
  const outputPath = process.env.NAVER_STORAGE_STATE_PATH ?? "./artifacts/naver-auth/storage-state.json";

  const browser = await chromium.connectOverCDP(cdpUrl);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = context.pages()[0] ?? (await context.newPage());

  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  console.log(`[naver-save-storage-state] opened ${targetUrl}`);
  console.log("[naver-save-storage-state] complete the login in the browser, then press Enter here to save state");

  await waitForEnter();

  await mkdir(dirname(outputPath), { recursive: true });
  await context.storageState({ path: outputPath });
  await writeFile(
    outputPath.replace(/\.json$/i, ".url.txt"),
    `${targetUrl}\n`,
    "utf8"
  ).catch(() => undefined);

  console.log(`[naver-save-storage-state] saved storage state to ${outputPath}`);
}

function waitForEnter(): Promise<void> {
  return new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    process.stdin.once("data", () => {
      resolve();
    });
  });
}

void main().catch((error) => {
  console.error("[naver-save-storage-state] failed", error);
  process.exit(1);
});