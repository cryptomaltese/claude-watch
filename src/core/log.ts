import { appendFileSync, existsSync, statSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getConfigDir } from "./config.js";

type Level = "debug" | "info" | "notice" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = {
  debug: 0, info: 1, notice: 2, warn: 3, error: 4,
};

const MAX_LOG_SIZE = 10 * 1024 * 1024;
const MAX_ROTATIONS = 3;

function getLogPath(): string {
  return join(getConfigDir(), "claude-watch.log");
}

function isDebugEnabled(): boolean {
  return process.env.CLAUDE_WATCH_DEBUG === "1";
}

function shouldLog(level: Level): boolean {
  const minLevel: Level = isDebugEnabled() ? "debug" : "info";
  return LEVEL_ORDER[level] >= LEVEL_ORDER[minLevel];
}

function rotate(logPath: string): void {
  try {
    if (!existsSync(logPath)) return;
    const stat = statSync(logPath);
    if (stat.size < MAX_LOG_SIZE) return;
    for (let i = MAX_ROTATIONS - 1; i >= 1; i--) {
      const from = `${logPath}.${i}`;
      const to = `${logPath}.${i + 1}`;
      if (existsSync(from)) renameSync(from, to);
    }
    renameSync(logPath, `${logPath}.1`);
    writeFileSync(logPath, "");
  } catch { /* rotation failure is non-critical */ }
}

export function log(level: Level, message: string): void {
  if (!shouldLog(level)) return;
  const logPath = getLogPath();
  const ts = new Date().toISOString();
  const line = `${ts} [${level.toUpperCase()}] ${message}\n`;
  try {
    rotate(logPath);
    appendFileSync(logPath, line);
  } catch { /* logging failure is non-critical */ }
  if (level === "error" || level === "warn") {
    process.stderr.write(`claude-watch: ${level}: ${message}\n`);
  }
}
