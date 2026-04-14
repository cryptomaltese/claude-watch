import { readdirSync, statSync, existsSync, renameSync } from "node:fs";
import { join, basename } from "node:path";
import { loadState, saveState, rollForward, withStateLock } from "../core/state.js";
import { getTmuxDriver } from "../core/tmux.js";
import { cwdToTmuxName, pathToSlug } from "../core/slug.js";
import { validateJsonl } from "../core/sessions.js";
import { getProjectsDir, loadConfig } from "../core/config.js";
import { log } from "../core/log.js";
import { addNotice } from "../core/notices.js";

export async function runScan(): Promise<void> {
  let alive = 0;
  let revived = 0;
  let pruned = 0;

  await withStateLock(async () => {
    let state = loadState();
    const driver = getTmuxDriver();
    const config = loadConfig();
    const entriesToKeep: typeof state.entries = [];

    for (const entry of state.entries) {
      if (!existsSync(entry.cwd)) {
        pruned++;
        addNotice("notice", `Pruned stale entry: ${entry.cwd} (directory no longer exists)`);
        continue;
      }

      const slug = pathToSlug(entry.cwd);
      const slugDir = join(getProjectsDir(), slug);
      const jsonls = getJsonlsInSlug(slugDir);
      const rolled = rollForward(entry, jsonls);
      const tmuxName = cwdToTmuxName(entry.cwd);

      if (driver.hasSession(tmuxName)) {
        alive++;
        entriesToKeep.push(rolled);
        continue;
      }

      revived++;

      if (rolled.pinnedJsonl === null) {
        const cmd = "claude --dangerously-skip-permissions --permission-mode bypassPermissions";
        driver.newSession(tmuxName, entry.cwd, cmd);
        log("info", `${tmuxName} started fresh (new session)`);
      } else {
        const jsonlPath = join(slugDir, `${rolled.pinnedJsonl}.jsonl`);

        if (existsSync(jsonlPath) && validateJsonl(jsonlPath)) {
          const cmd = `claude --dangerously-skip-permissions --permission-mode bypassPermissions --resume ${rolled.pinnedJsonl} --fork-session`;
          driver.newSession(tmuxName, entry.cwd, cmd);
          log("info", `${tmuxName} resumed from ${rolled.pinnedJsonl}`);
        } else {
          log("warn", `${tmuxName} pinned jsonl is invalid, trying fallbacks`);
          if (existsSync(jsonlPath)) {
            const ts = new Date().toISOString().replace(/[:.]/g, "-");
            renameSync(jsonlPath, `${jsonlPath}.broken-${ts}`);
          }

          const fallback = jsonls
            .filter((j) => j.id !== rolled.pinnedJsonl)
            .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
            .find((j) => validateJsonl(join(slugDir, `${j.id}.jsonl`)));

          if (fallback) {
            rolled.pinnedJsonl = fallback.id;
            rolled.pinnedAt = fallback.mtime.toISOString();
            const cmd = `claude --dangerously-skip-permissions --permission-mode bypassPermissions --resume ${fallback.id} --fork-session`;
            driver.newSession(tmuxName, entry.cwd, cmd);
            addNotice("warn", `${basename(entry.cwd)}: recovered from fallback session (pinned was malformed)`);
          } else {
            const cmd = "claude --dangerously-skip-permissions --permission-mode bypassPermissions";
            driver.newSession(tmuxName, entry.cwd, cmd);
            addNotice("warn", `${basename(entry.cwd)}: no recoverable session — started fresh`);
          }
        }
      }

      if (config.remoteControl) {
        const name = tmuxName;
        setTimeout(async () => {
          for (let i = 1; i <= 3; i++) {
            await new Promise((r) => setTimeout(r, 10_000));
            driver.sendKeys(name, "/remote-control");
            await new Promise((r) => setTimeout(r, 3_000));
            if (/remote.control/i.test(driver.capturePane(name))) {
              log("info", `${name} remote-control confirmed`);
              return;
            }
          }
          log("warn", `${name} remote-control not confirmed`);
        }, 0);
      }

      entriesToKeep.push(rolled);
    }

    state = { ...state, entries: entriesToKeep };
    saveState(state);
  });

  if (revived > 0 || pruned > 0) {
    log("info", `scan: ${alive} alive, ${revived} revived, ${pruned} pruned`);
  }
}

function getJsonlsInSlug(slugDir: string): { id: string; mtime: Date }[] {
  if (!existsSync(slugDir)) return [];
  try {
    return readdirSync(slugDir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => ({ id: basename(f, ".jsonl"), mtime: statSync(join(slugDir, f)).mtime }));
  } catch { return []; }
}
