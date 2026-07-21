import { callNaver, loadUrlList, summarize } from "./shared";

async function main() {
  const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:3000";
  const filePath = process.env.BASELINE_URL_FILE ?? "testdata/baseline-urls.txt";
  const expectedCount = Number.parseInt(process.env.BASELINE_EXPECTED_COUNT ?? "100", 10);

  const urls = await loadUrlList(filePath);
  if (urls.length < expectedCount) {
    throw new Error(`Baseline requires at least ${expectedCount} URLs, found ${urls.length}`);
  }

  const selected = urls.slice(0, expectedCount);
  const samples = [];

  for (const url of selected) {
    const sample = await callNaver(baseUrl, url);
    samples.push(sample);
  }

  const summary = summarize(samples);
  console.log(JSON.stringify({ mode: "baseline", baseUrl, filePath, summary }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
