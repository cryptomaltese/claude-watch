import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { getConfigDir } from "./config.js";

export interface Notice {
  timestamp: string;
  severity: "warn" | "notice";
  message: string;
}

function getNoticesPath(): string {
  return join(getConfigDir(), "notices");
}

export function addNotice(severity: "warn" | "notice", message: string): void {
  const entry: Notice = {
    timestamp: new Date().toISOString(),
    severity,
    message,
  };
  try {
    appendFileSync(getNoticesPath(), JSON.stringify(entry) + "\n");
  } catch { /* non-critical */ }
}

export function readAndClearNotices(): Notice[] {
  const path = getNoticesPath();
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, "utf-8").trim();
    if (!raw) return [];
    writeFileSync(path, "");
    return raw.split("\n").filter(Boolean).map((line) => JSON.parse(line) as Notice);
  } catch {
    return [];
  }
}
