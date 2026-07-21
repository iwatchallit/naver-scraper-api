import { callNaver, loadUrlList, summarize } from "./shared";

async function main() {
  const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:3000";
  const filePath = process.env.CORPUS_URL_FILE ?? "testdata/corpus-urls.txt";

  const urls = await loadUrlList(filePath);
  const unique = new Set(urls);

  if (unique.size < 1000) {
    throw new Error(`Corpus run requires at least 1000 unique URLs, found ${unique.size}`);
  }

  const samples = [];
  for (const url of unique) {
    const sample = await callNaver(baseUrl, url);
    samples.push(sample);
  }

  const summary = summarize(samples);
  console.log(
    JSON.stringify(
      {
        mode: "corpus",
        baseUrl,
        filePath,
        uniqueUrls: unique.size,
        summary
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
