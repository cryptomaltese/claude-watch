import { readdirSync, statSync, existsSync, renameSync } from "node:fs";
import { join, basename } from "node:path";
import { loadState, saveState, rollForward, withStateLock } from "../core/state.js";
import { getTmuxDriver } from "../core/tmux.js";
import { cwdToTmuxName, pathToSlug } from "../core/slug.js";
import { findTmuxForCwd } from "../core/actions.js";
import { validateJsonl } from "../core/sessions.js";
import { getProjectsDir, loadConfig } from "../core/config.js";
import { log } from "../core/log.js";
import { addNotice } from "../core/notices.js";
import { buildClaudeCmd } from "../core/actions.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateJsonlId(id: string): void {
  if (!UUID_RE.test(id)) {
    throw new Error(`invalid jsonl ID (expected UUID): ${id}`);
  }
}

async function activateRemoteControlAsync(tmuxName: string): Promise<void> {
  const driver = getTmuxDriver();
  for (let i = 1; i <= 3; i++) {
    await new Promise((r) => setTimeout(r, 10_000));
    driver.sendKeys(tmuxName, "/remote-control");
    await new Promise((r) => setTimeout(r, 3_000));
    if (/remote.control/i.test(driver.capturePane(tmuxName))) {
      log("info", `${tmuxName} remote-control confirmed`);
      return;
    }
  }
  log("warn", `${tmuxName} remote-control not confirmed`);
}

export async function runScan(): Promise<void> {
  let alive = 0;
  let revived = 0;
  let pruned = 0;
  const sessionsToRC: string[] = [];

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
      const existingTmux = findTmuxForCwd(driver, entry.cwd);

      if (existingTmux) {
        alive++;
        entriesToKeep.push(rolled);
        // Activate RC on alive sessions that aren't yet RC-confirmed.
        // Handles brand-new sessions from createNew (which skips RC to avoid
        // blocking the user while claude loads) and sessions where RC dropped.
        if (
          config.remoteControl &&
          !/remote.control/i.test(driver.capturePane(existingTmux))
        ) {
          sessionsToRC.push(existingTmux);
        }
        continue;
      }

      revived++;
      const tmuxName = cwdToTmuxName(entry.cwd);

      if (rolled.pinnedJsonl === null) {
        driver.newSession(tmuxName, entry.cwd, buildClaudeCmd(null));
        log("info", `${tmuxName} started fresh (new session)`);
      } else {
        const jsonlId = rolled.pinnedJsonl;
        const jsonlPath = join(slugDir, `${jsonlId}.jsonl`);

        // Validate UUID before using in command
        const isValidUuid = UUID_RE.test(jsonlId);

        if (isValidUuid && existsSync(jsonlPath) && validateJsonl(jsonlPath)) {
          validateJsonlId(jsonlId);
          driver.newSession(tmuxName, entry.cwd, buildClaudeCmd(jsonlId));
          log("info", `${tmuxName} resumed from ${jsonlId}`);
        } else {
          if (!isValidUuid) {
            log("warn", `${tmuxName} pinned jsonl has invalid UUID format, trying fallbacks`);
          } else {
            log("warn", `${tmuxName} pinned jsonl is invalid, trying fallbacks`);
          }
          if (existsSync(jsonlPath)) {
            const ts = new Date().toISOString().replace(/[:.]/g, "-");
            renameSync(jsonlPath, `${jsonlPath}.broken-${ts}`);
          }

          const fallback = jsonls
            .filter((j) => j.id !== jsonlId && UUID_RE.test(j.id))
            .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
            .find((j) => validateJsonl(join(slugDir, `${j.id}.jsonl`)));

          if (fallback) {
            rolled.pinnedJsonl = fallback.id;
            rolled.pinnedAt = fallback.mtime.toISOString();
            driver.newSession(tmuxName, entry.cwd, buildClaudeCmd(fallback.id));
            addNotice("warn", `${basename(entry.cwd)}: recovered from fallback session (pinned was malformed)`);
          } else {
            driver.newSession(tmuxName, entry.cwd, buildClaudeCmd(null));
            addNotice("warn", `${basename(entry.cwd)}: no recoverable session — started fresh`);
          }
        }
      }

      if (config.remoteControl) {
        sessionsToRC.push(tmuxName);
      }

      entriesToKeep.push(rolled);
    }

    state = { ...state, entries: entriesToKeep };
    saveState(state);
  });

  if (revived > 0 || pruned > 0) {
    log("info", `scan: ${alive} alive, ${revived} revived, ${pruned} pruned`);
  }

  // After the lock is released, await all remote-control activations.
  // Using Promise.allSettled so sessions run concurrently and we wait for all
  // before the process exits (avoids detached setTimeout fire-and-forget).
  if (sessionsToRC.length > 0) {
    await Promise.allSettled(
      sessionsToRC.map((name) => activateRemoteControlAsync(name))
    );
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
