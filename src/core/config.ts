import { readFileSync, existsSync, renameSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export type PermissionMode =
  | "auto"
  | "bypassPermissions"
  | "acceptEdits"
  | "default"
  | "dontAsk"
  | "plan";

const VALID_PERMISSION_MODES: readonly PermissionMode[] = [
  "auto", "bypassPermissions", "acceptEdits", "default", "dontAsk", "plan",
];

export interface Config {
  peekLines: number;
  pageSize: number;
  remoteControl: boolean;
  resume: boolean;
  /**
   * Permission mode passed to claude on spawn via `--permission-mode`.
   * Default "auto" routes decisions through the auto-mode classifier, which
   * has explicit allow rules for routine memory writes — unlike bypass,
   * which is blocked by the native memory-dir protection above bypass.
   */
  permissionMode: PermissionMode;
  /**
   * When true, claude is spawned with `--dangerously-skip-permissions`.
   * Blunter than permissionMode; hits the native memory-dir prompt issue.
   * Off by default. Opt-in for users who explicitly want the nuclear option.
   */
  dangerouslySkipPermissions: boolean;
}

const DEFAULTS: Config = {
  peekLines: 7,
  pageSize: 10,
  remoteControl: true,
  resume: true,
  permissionMode: "auto",
  dangerouslySkipPermissions: false,
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
    const permissionMode =
      VALID_PERMISSION_MODES.includes(parsed.permissionMode as PermissionMode)
        ? (parsed.permissionMode as PermissionMode)
        : DEFAULTS.permissionMode;
    return {
      peekLines: typeof parsed.peekLines === "number" ? parsed.peekLines : DEFAULTS.peekLines,
      pageSize: typeof parsed.pageSize === "number" ? parsed.pageSize : DEFAULTS.pageSize,
      remoteControl: typeof parsed.remoteControl === "boolean" ? parsed.remoteControl : DEFAULTS.remoteControl,
      resume: typeof parsed.resume === "boolean" ? parsed.resume : DEFAULTS.resume,
      permissionMode,
      dangerouslySkipPermissions:
        typeof parsed.dangerouslySkipPermissions === "boolean"
          ? parsed.dangerouslySkipPermissions
          : DEFAULTS.dangerouslySkipPermissions,
    };
  } catch {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    renameSync(configPath, `${configPath}.broken-${ts}`);
    return { ...DEFAULTS };
  }
}
