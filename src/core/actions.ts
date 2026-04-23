import {
  existsSync, mkdirSync, writeFileSync,
  cpSync, statSync, readdirSync, unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { loadState, saveState, upsertEntry, removeEntry, withStateLock } from "./state.js";
import { getTmuxDriver, type TmuxDriver } from "./tmux.js";
import { cwdToTmuxName, cwdToTmuxNameCandidates, pathToSlug } from "./slug.js";
import { log } from "./log.js";
import { loadConfig, getProjectsDir } from "./config.js";

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

interface RefreshOpts {
  cwd: string;
  jsonlId: string;
  attach?: boolean;
  remoteControl?: boolean;
}

interface ForkOpts {
  cwd: string;            // target cwd for the fork
  srcJsonlPath: string;   // absolute path to source jsonl
  srcJsonlId: string;     // UUID of the source jsonl
  attach?: boolean;
  remoteControl?: boolean;
}

// How long we'll poll for the fork's own jsonl to appear before giving up
// on breadcrumb cleanup. Fire-and-forget — doesn't block fork() from returning.
const BREADCRUMB_CLEANUP_TIMEOUT_MS = 30_000;
const ACTIVE_TURN_WINDOW_MS = 2_000;

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

export function buildClaudeCmd(
  jsonlId: string | null,
  opts?: { fork?: boolean }
): string {
  const config = loadConfig();
  let cmd = "claude";
  if (config.dangerouslySkipPermissions) cmd += " --dangerously-skip-permissions";
  cmd += ` --permission-mode ${config.permissionMode}`;
  if (jsonlId) {
    cmd += ` --resume ${jsonlId}`;
    // --fork-session is opt-in via the fork action. Default spawns use the
    // stable resume path so Desktop keeps the conversation title.
    if (opts?.fork) cmd += " --fork-session";
  }
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

/**
 * Best-effort removal of the breadcrumb source jsonl in the target project
 * dir. Claude Code needs the breadcrumb only for the initial `--resume`
 * lookup; once the fork's own jsonl is written, the copy is redundant and
 * would show up in the picker as a confusing ghost "source at target cwd"
 * entry. Polls for the fork jsonl to appear, then unlinks the breadcrumb.
 * Fire-and-forget: errors are swallowed, fork() doesn't await this.
 */
async function cleanupBreadcrumb(
  targetProjectDir: string,
  srcJsonlId: string,
  timeoutMs: number
): Promise<void> {
  const breadcrumbPath = join(targetProjectDir, `${srcJsonlId}.jsonl`);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const otherJsonls = readdirSync(targetProjectDir).filter(
        (f) => f.endsWith(".jsonl") && f !== `${srcJsonlId}.jsonl`
      );
      if (otherJsonls.length > 0) {
        try { unlinkSync(breadcrumbPath); } catch { /* ignore */ }
        return;
      }
    } catch { return; /* dir gone — caller was torn down, give up */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  log("warn", `breadcrumb cleanup timed out for ${breadcrumbPath}`);
}

/**
 * Fork a session into a new cwd. Copies the source jsonl into the target
 * cwd's project dir as a breadcrumb so `--resume` can find it, spawns
 * `claude --resume <src> --fork-session` in a new tmux, and watches the
 * target cwd. Source stays untouched.
 *
 * Refuses if: (a) source has an active turn (jsonl mtime < ~2s ago),
 * (b) target cwd is already watched, (c) target cwd has a live tmux
 * session. Matches the "rare deliberate action" framing — silent overwrite
 * of existing state would mask user error.
 */
export async function fork(opts: ForkOpts): Promise<void> {
  const { cwd, srcJsonlPath, srcJsonlId, attach = false, remoteControl } = opts;
  validateJsonlId(srcJsonlId);
  validateCwd(cwd);
  if (!existsSync(srcJsonlPath)) {
    throw new Error(`source jsonl does not exist: ${srcJsonlPath}`);
  }

  // Active-turn guard: if the source jsonl was written to very recently,
  // a turn is likely in flight. Copying mid-write could yield a torn line.
  const srcStat = statSync(srcJsonlPath);
  if (Date.now() - srcStat.mtimeMs < ACTIVE_TURN_WINDOW_MS) {
    throw new Error("source has an active turn — wait a moment and retry");
  }

  // Watched-target guard
  const existingState = loadState();
  if (existingState.entries.some((e) => e.cwd === cwd)) {
    throw new Error("already watched — deactivate first");
  }

  // Live-tmux-target guard
  const driver = getTmuxDriver();
  if (findTmuxForCwd(driver, cwd)) {
    throw new Error("active session in target cwd — refresh or deactivate first");
  }

  const config = loadConfig();
  const enableRC = remoteControl ?? config.remoteControl;

  mkdirSync(cwd, { recursive: true });

  const targetProjectDir = join(getProjectsDir(), pathToSlug(cwd));
  mkdirSync(targetProjectDir, { recursive: true });
  cpSync(srcJsonlPath, join(targetProjectDir, `${srcJsonlId}.jsonl`));

  await withStateLock(() => {
    const state = loadState();
    saveState(upsertEntry(state, { cwd, pinnedJsonl: null, pinnedAt: new Date().toISOString() }));
  });

  const tmuxName = cwdToTmuxName(cwd);
  driver.newSession(tmuxName, cwd, buildClaudeCmd(srcJsonlId, { fork: true }));
  log("info", `${tmuxName} forked from ${srcJsonlId} in ${cwd}`);

  // Fire-and-forget breadcrumb cleanup
  void cleanupBreadcrumb(targetProjectDir, srcJsonlId, BREADCRUMB_CLEANUP_TIMEOUT_MS);

  if (enableRC && !attach) await activateRemoteControl(tmuxName);
  if (attach) writeSentinel(tmuxName);
}

/**
 * Kill the running claude in this cwd's tmux and respawn it fresh, resuming
 * from the given jsonlId. Leaves watched.json untouched — watched stays
 * watched, unwatched stays unwatched. Useful after installing a new MCP,
 * skill, or CLAUDE.md change, so the session picks up the new config.
 */
export async function refresh(opts: RefreshOpts): Promise<void> {
  const { cwd, jsonlId, attach = false, remoteControl } = opts;
  validateJsonlId(jsonlId);
  validateCwd(cwd);
  if (!existsSync(cwd)) throw new Error(`directory does not exist: ${cwd}`);

  const config = loadConfig();
  const enableRC = remoteControl ?? config.remoteControl;

  const driver = getTmuxDriver();
  const existing = findTmuxForCwd(driver, cwd);
  if (existing) {
    driver.killSession(existing);
    log("info", `${existing} killed for refresh`);
  }

  const tmuxName = cwdToTmuxName(cwd);
  driver.newSession(tmuxName, cwd, buildClaudeCmd(jsonlId));
  log("info", `${tmuxName} refreshed — resumed from ${jsonlId}`);

  if (enableRC && !attach) await activateRemoteControl(tmuxName);
  if (attach) writeSentinel(tmuxName);
}
