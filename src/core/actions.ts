import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { loadState, saveState, upsertEntry, removeEntry, withStateLock } from "./state.js";
import { getTmuxDriver } from "./tmux.js";
import { cwdToTmuxName } from "./slug.js";
import { log } from "./log.js";
import { loadConfig } from "./config.js";

interface ActivateOpts {
  cwd: string;
  jsonlId: string;
  attach?: boolean;
  remoteControl?: boolean;
}

interface DeactivateOpts {
  cwd: string;
  kill?: boolean;
  attach?: boolean;
}

interface CreateNewOpts {
  cwd: string;
  attach?: boolean;
  remoteControl?: boolean;
}

function buildClaudeCmd(jsonlId: string | null): string {
  let cmd = "claude --dangerously-skip-permissions --permission-mode bypassPermissions";
  if (jsonlId) cmd += ` --resume ${jsonlId} --fork-session`;
  return cmd;
}

function writeSentinel(tmuxName: string): void {
  const sentinelPath = process.env.CLAUDE_WATCH_SENTINEL;
  if (sentinelPath) writeFileSync(sentinelPath, tmuxName);
}

async function activateRemoteControl(tmuxName: string): Promise<boolean> {
  const driver = getTmuxDriver();
  for (let attempt = 1; attempt <= 3; attempt++) {
    await new Promise((r) => setTimeout(r, 10_000));
    driver.sendKeys(tmuxName, "/remote-control");
    await new Promise((r) => setTimeout(r, 3_000));
    const pane = driver.capturePane(tmuxName);
    if (/remote.control/i.test(pane)) {
      log("info", `${tmuxName} remote-control confirmed on attempt ${attempt}`);
      return true;
    }
  }
  log("warn", `${tmuxName} remote-control not confirmed after 3 attempts`);
  return false;
}

export async function activate(opts: ActivateOpts): Promise<void> {
  const { cwd, jsonlId, attach = false, remoteControl } = opts;
  if (!existsSync(cwd)) throw new Error(`directory does not exist: ${cwd}`);

  const tmuxName = cwdToTmuxName(cwd);
  const config = loadConfig();
  const enableRC = remoteControl ?? config.remoteControl;

  await withStateLock(() => {
    const state = loadState();
    const updated = upsertEntry(state, { cwd, pinnedJsonl: jsonlId, pinnedAt: new Date().toISOString() });
    saveState(updated);
  });

  const driver = getTmuxDriver();
  if (!driver.hasSession(tmuxName)) {
    driver.newSession(tmuxName, cwd, buildClaudeCmd(jsonlId));
    log("info", `${tmuxName} started in ${cwd}`);
    if (enableRC) await activateRemoteControl(tmuxName);
  }

  if (attach) writeSentinel(tmuxName);
}

export async function deactivate(opts: DeactivateOpts): Promise<void> {
  const { cwd, kill = true, attach = false } = opts;
  const tmuxName = cwdToTmuxName(cwd);

  await withStateLock(() => {
    const state = loadState();
    saveState(removeEntry(state, cwd));
  });

  const driver = getTmuxDriver();
  if (kill && driver.hasSession(tmuxName)) {
    driver.killSession(tmuxName);
    log("info", `${tmuxName} killed`);
  }

  if (attach) writeSentinel(tmuxName);
}

export async function createNew(opts: CreateNewOpts): Promise<void> {
  const { cwd, attach = false, remoteControl } = opts;
  const tmuxName = cwdToTmuxName(cwd);
  const config = loadConfig();
  const enableRC = remoteControl ?? config.remoteControl;

  mkdirSync(cwd, { recursive: true });

  await withStateLock(() => {
    const state = loadState();
    saveState(upsertEntry(state, { cwd, pinnedJsonl: null, pinnedAt: new Date().toISOString() }));
  });

  const driver = getTmuxDriver();
  if (!driver.hasSession(tmuxName)) {
    driver.newSession(tmuxName, cwd, buildClaudeCmd(null));
    log("info", `${tmuxName} started fresh in ${cwd}`);
    if (enableRC) await activateRemoteControl(tmuxName);
  }

  if (attach) writeSentinel(tmuxName);
}
