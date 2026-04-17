import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

interface HookInput {
  claudeHome: string;
  cwd: string;
}

interface HookOutput {
  result: "ok" | "warn";
  message?: string;
}

const PERM_FREE_MODES = ["auto", "bypassPermissions"] as const;
type PermFreeMode = (typeof PERM_FREE_MODES)[number];

export function sessionStartHook(input: HookInput): HookOutput {
  const warnings: string[] = [];

  const settingsPath = join(input.claudeHome, "settings.json");
  if (existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
      const defaultMode = settings?.permissions?.defaultMode;
      const isPermFree = PERM_FREE_MODES.includes(defaultMode as PermFreeMode);

      if (!isPermFree) {
        warnings.push(
          `claude-watch: permissions.defaultMode is '${defaultMode ?? "(unset)"}' — ` +
          `expected 'auto' (recommended) or 'bypassPermissions'. Watched sessions may prompt.`
        );
      }

      // Auto mode requires enableAutoMode to be unlocked in settings.
      if (defaultMode === "auto" && settings?.enableAutoMode !== true) {
        warnings.push(
          "claude-watch: permissions.defaultMode is 'auto' but enableAutoMode is not true in settings.json. " +
          "Each new session will prompt to enable auto mode."
        );
      }
    } catch {}
  }

  return warnings.length === 0
    ? { result: "ok" }
    : { result: "warn", message: warnings.join("\n") };
}
