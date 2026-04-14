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

export function sessionStartHook(input: HookInput): HookOutput {
  const warnings: string[] = [];

  const settingsPath = join(input.claudeHome, "settings.json");
  if (existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
      if (settings?.permissions?.defaultMode !== "bypassPermissions") {
        warnings.push(
          "claude-watch: permissions.defaultMode is not bypassPermissions in settings.json. " +
          "Watched sessions may prompt for permissions on resume."
        );
      }
    } catch {}
  }

  const localPath = join(input.cwd, ".claude", "settings.local.json");
  if (existsSync(localPath)) {
    try {
      const local = JSON.parse(readFileSync(localPath, "utf-8"));
      const allowList = local?.permissions?.allow;
      if (Array.isArray(allowList) && allowList.length > 0) {
        warnings.push(
          `claude-watch: ${localPath} has an explicit allow list — ` +
          "it may override the global bypass mode."
        );
      }
    } catch {}
  }

  if (warnings.length === 0) return { result: "ok" };
  return { result: "warn", message: warnings.join("\n") };
}
