import { buildServer } from "./app";

async function start() {
  const app = buildServer();
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "127.0.0.1";

  try {
    await app.listen({ port, host });
    app.log.info({ host, port }, "Naver scraper API listening");
  } catch (error) {
    app.log.error(error, "Failed to start API");
    process.exit(1);
  }
}

void start();
