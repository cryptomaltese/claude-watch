import { readFileSync, existsSync, renameSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface Config {
  peekLines: number;
  pageSize: number;
  remoteControl: boolean;
  resume: boolean;
}

const DEFAULTS: Config = {
  peekLines: 7,
  pageSize: 10,
  remoteControl: true,
  resume: true,
};

export function getConfigDir(): string {
  return process.env.CLAUDE_WATCH_CONFIG_DIR ?? join(homedir(), ".claude-watch");
}

export function getProjectsDir(): string {
  if (process.env.CLAUDE_WATCH_PROJECTS_DIR) {
    return process.env.CLAUDE_WATCH_PROJECTS_DIR;
  }
  const claudeHome = process.env.CLAUDE_HOME ?? join(homedir(), ".claude");
  return join(claudeHome, "projects");
}

export function ensureConfigDir(): void {
  mkdirSync(getConfigDir(), { recursive: true });
}

export function loadConfig(): Config {
  const configPath = join(getConfigDir(), "config.json");
  if (!existsSync(configPath)) return { ...DEFAULTS };

  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      peekLines: typeof parsed.peekLines === "number" ? parsed.peekLines : DEFAULTS.peekLines,
      pageSize: typeof parsed.pageSize === "number" ? parsed.pageSize : DEFAULTS.pageSize,
      remoteControl: typeof parsed.remoteControl === "boolean" ? parsed.remoteControl : DEFAULTS.remoteControl,
      resume: typeof parsed.resume === "boolean" ? parsed.resume : DEFAULTS.resume,
    };
  } catch {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    renameSync(configPath, `${configPath}.broken-${ts}`);
    return { ...DEFAULTS };
  }
}
