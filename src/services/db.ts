import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export interface ScrapeLogEntry {
  id: string;
  timestamp: string;
  url: string;
  status: "success" | "error";
  latencyMs: number;
  errorMessage?: string;
  screenshotBase64?: string;
}

const MAX_LOGS = 500;
const LOGS_DIR = path.resolve(process.cwd(), ".scratch");
const LOGS_FILE = path.join(LOGS_DIR, "logs.json");

function ensureDirectoryExists() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

export function getLogs(): ScrapeLogEntry[] {
  try {
    ensureDirectoryExists();
    if (!fs.existsSync(LOGS_FILE)) {
      return [];
    }
    const data = fs.readFileSync(LOGS_FILE, "utf-8");
    return JSON.parse(data) as ScrapeLogEntry[];
  } catch (error) {
    console.error("Failed to read logs:", error);
    return [];
  }
}

export function clearLogs(): void {
  try {
    ensureDirectoryExists();
    fs.writeFileSync(LOGS_FILE, JSON.stringify([], null, 2), "utf-8");
  } catch (error) {
    console.error("Failed to clear logs:", error);
  }
}

export function insertLog(
  url: string,
  status: "success" | "error",
  latencyMs: number,
  errorMessage?: string,
  screenshotBase64?: string
): void {
  try {
    const logs = getLogs();

    const newLog: ScrapeLogEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      url,
      status,
      latencyMs,
      errorMessage,
      screenshotBase64
    };

    // Insert at the beginning so newest is first
    logs.unshift(newLog);

    // Prune to MAX_LOGS
    if (logs.length > MAX_LOGS) {
      logs.length = MAX_LOGS;
    }

    fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2), "utf-8");
  } catch (error) {
    console.error("Failed to insert log:", error);
  }
}
