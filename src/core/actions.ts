import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { loadState, saveState, upsertEntry, removeEntry, withStateLock } from "./state.js";
import { getTmuxDriver, type TmuxDriver } from "./tmux.js";
import { cwdToTmuxName, cwdToTmuxNameCandidates } from "./slug.js";
import { log } from "./log.js";
import { loadConfig } from "./config.js";

/**
 * Find the tmux session (if any) currently running in the given cwd.
 * Matches by candidate name (canonical slug, basename) first, then by
 * pane_current_path for sessions with arbitrary user-chosen names.
 * Returns the actual tmux session name, or null if none.
 */
export function findTmuxForCwd(driver: TmuxDriver, cwd: string): string | null {
  for (const name of cwdToTmuxNameCandidates(cwd)) {
    if (driver.hasSession(name)) return name;
  }
  for (const [name, paneCwd] of driver.getNameCwdMap()) {
    if (paneCwd === cwd) return name;
  }
  return null;
}

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateJsonlId(id: string): void {
  if (!UUID_RE.test(id)) {
    throw new Error(`invalid jsonl ID (expected UUID): ${id}`);
  }
}

function validateCwd(cwd: string): void {
  if (/[\t\n\r]/.test(cwd)) {
    throw new Error(`cwd contains tab or newline — unsupported: ${cwd}`);
  }
  if (/[$`\\"'#]/.test(cwd)) {
    log("warn", `cwd contains shell-sensitive characters: ${cwd}`);
  }
}

export function buildClaudeCmd(jsonlId: string | null): string {
  const config = loadConfig();
  let cmd = "claude";
  if (config.dangerouslySkipPermissions) cmd += " --dangerously-skip-permissions";
  cmd += ` --permission-mode ${config.permissionMode}`;
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
  validateJsonlId(jsonlId);
  validateCwd(cwd);
  if (!existsSync(cwd)) throw new Error(`directory does not exist: ${cwd}`);

  const config = loadConfig();
  const enableRC = remoteControl ?? config.remoteControl;

  await withStateLock(() => {
    const state = loadState();
    const updated = upsertEntry(state, { cwd, pinnedJsonl: jsonlId, pinnedAt: new Date().toISOString() });
    saveState(updated);
  });

  const driver = getTmuxDriver();
  let tmuxName = findTmuxForCwd(driver, cwd);

  if (tmuxName) {
    log("info", `${tmuxName} adopted (already running in ${cwd})`);
  } else {
    tmuxName = cwdToTmuxName(cwd);
    driver.newSession(tmuxName, cwd, buildClaudeCmd(jsonlId));
    log("info", `${tmuxName} started in ${cwd}`);
    if (enableRC) await activateRemoteControl(tmuxName);
  }

  if (attach) writeSentinel(tmuxName);
}

export async function deactivate(opts: DeactivateOpts): Promise<void> {
  const { cwd, kill = true, attach = false } = opts;
  validateCwd(cwd);

  await withStateLock(() => {
    const state = loadState();
    saveState(removeEntry(state, cwd));
  });

  const driver = getTmuxDriver();
  const tmuxName = findTmuxForCwd(driver, cwd) ?? cwdToTmuxName(cwd);

  if (kill && driver.hasSession(tmuxName)) {
    driver.killSession(tmuxName);
    log("info", `${tmuxName} killed`);
  }

  if (attach) writeSentinel(tmuxName);
}

export async function createNew(opts: CreateNewOpts): Promise<void> {
  const { cwd, attach = false, remoteControl } = opts;
  validateCwd(cwd);
  const config = loadConfig();
  const enableRC = remoteControl ?? config.remoteControl;

  mkdirSync(cwd, { recursive: true });

  await withStateLock(() => {
    const state = loadState();
    saveState(upsertEntry(state, { cwd, pinnedJsonl: null, pinnedAt: new Date().toISOString() }));
  });

  const driver = getTmuxDriver();
  let tmuxName = findTmuxForCwd(driver, cwd);

  if (tmuxName) {
    log("info", `${tmuxName} adopted (already running in ${cwd})`);
  } else {
    tmuxName = cwdToTmuxName(cwd);
    driver.newSession(tmuxName, cwd, buildClaudeCmd(null));
    log("info", `${tmuxName} started fresh in ${cwd}`);
    // When not attaching, await RC so the session is visible in Desktop
    // by the time this returns. When attaching, skip RC — the user will
    // interact with claude directly and can run /remote-control themselves.
    if (enableRC && !attach) await activateRemoteControl(tmuxName);
  }

  if (attach) writeSentinel(tmuxName);
}
