import { loadState } from "../core/state.js";
import { getTmuxDriver } from "../core/tmux.js";
import { findTmuxForCwd, buildClaudeCmd } from "../core/actions.js";
import { cwdToTmuxName, normalizeCwd } from "../core/slug.js";
import { log } from "../core/log.js";

function validateCwd(cwd: string): void {
  if (/[\t\n\r]/.test(cwd)) throw new Error(`cwd contains tab or newline — unsupported: ${cwd}`);
}

/**
 * Naked attach: switch the current tmux client to the named session's pane.
 * No action on the session itself — except the one concession to convenience:
 * if the session is watched-but-dead, auto-resuscitate it before switching,
 * since the cron scan would do the same thing within 5 minutes anyway.
 *
 * Refuses to adopt (activate) an unwatched dead session — that's a state
 * change users should opt into explicitly via the `activate` command.
 *
 * Outside tmux (no $TMUX), prints a `tmux attach -t <name>` hint and exits 0.
 */
export async function runAttach(args: string[]): Promise<void> {
  const cwdRaw = args[0];
  if (!cwdRaw) throw new Error("usage: claude-watch attach <cwd>");
  const cwd = normalizeCwd(cwdRaw);
  validateCwd(cwd);

  const driver = getTmuxDriver();
  const state = loadState();
  const watchedEntry = state.entries.find((e) => e.cwd === cwd);
  const existingTmux = findTmuxForCwd(driver, cwd);
  const tmuxName = existingTmux ?? cwdToTmuxName(cwd);

  if (!existingTmux) {
    if (!watchedEntry) {
      throw new Error(
        "not watched — activate first if you want to adopt this session"
      );
    }
    // Watched + dead: fast-attach resuscitate. Spawn with --resume if we have
    // a pinned jsonl, otherwise fresh (brand-new session path). Skip RC
    // activation — that's 25-40s the user doesn't want to wait for when
    // they're just attaching; cron will RC on its next sweep.
    driver.newSession(tmuxName, cwd, buildClaudeCmd(watchedEntry.pinnedJsonl));
    log("info", `${tmuxName} resuscitated for attach`);
  }

  if (!process.env.TMUX) {
    console.log(`Not inside tmux. Run: tmux attach -t ${tmuxName}`);
    return;
  }

  driver.switchClient(tmuxName);
}
