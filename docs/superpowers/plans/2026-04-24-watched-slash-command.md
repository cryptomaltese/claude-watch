# `/watched` slash command — claude-watch inside Claude Code

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let users manage their claude-watch sessions from inside a running Claude Code conversation, without leaving the TUI. The slash command `/watched` surfaces the session list, collects an action via structured prompts, and can either stay in the current Claude or switch focus to the selected session's tmux pane.

**Why not a custom TUI inside Claude Code:** Claude Code does not expose TUI extension slots to plugins — only slash commands (markdown prompts), skills (instructions), and MCP servers. A plugin cannot render React/Ink inside Claude Code's running frame. The idiomatic pattern is: slash command → shell out to the plugin's CLI → present results → collect input via `AskUserQuestion` or conversational text → shell out to act.

**Action matrix (frozen):**

| State | Actions |
|---|---|
| Unwatched + alive | activate, fork, attach (switch only) |
| Unwatched + dead | activate, fork |
| Watched + alive w/ jsonl | deactivate, refresh, fork, attach |
| Watched + dead w/ jsonl | deactivate, refresh, fork, attach (auto-resuscitate) |
| Watched + brand-new alive | deactivate, refresh, attach |
| Watched + brand-new dead | deactivate, refresh, attach (auto-resuscitate) |

Every cell ≤ 4 options → fits `AskUserQuestion`'s cap. "attach" never changes user-visible state (auto-resuscitating a watched+dead session is idempotent — the cron would do it anyway on its 5-minute sweep).

**Flow:**

```
/watched [-s <query>]
    ↓
Claude runs: claude-watch status --json [--search <query>]
    ↓
Claude prints numbered list (2 lines per row: name + meta)
    ↓
User: "3"  (or "more" for pagination if no -s was given)
    ↓
AskUserQuestion: "what action?"  (per-state options from matrix above)
    ↓
If action != attach: AskUserQuestion: "stay here, or continue in the selected session?"
    ↓
Claude runs: claude-watch <action> <cwd> [+ tmux switch-client if continue]
If action == attach: Claude runs: claude-watch attach <cwd>
```

**Graceful fallback when not in tmux:** `claude-watch attach` and `tmux switch-client` detect `$TMUX` and bail with a printed `tmux attach -t <name>` hint if absent.

---

## File Structure

**CLI additions (Modified):**
- `src/commands/status.ts` — add `--json`, `--search <q>`, `--page <n>` flags
- `src/commands/attach.ts` — **new** command file; `attach <cwd>` switches tmux, auto-resuscitates watched+dead
- `src/cli.ts` — register the `attach` subcommand
- `src/core/actions.ts` — relax `refresh()` to accept null `jsonlId`; `buildClaudeCmd(null)` already handles the no-`--resume` branch

**Plugin glue (New):**
- `commands/watched.md` — slash command markdown, lives at the plugin root (not under `src/` — this is the prompt Claude Code reads, not code)
- `.claude-plugin/plugin.json` — ensure it declares the command entry (verify current shape first)

**Tests (New / Modified):**
- `tests/commands/status.test.ts` — `--json` shape, `--search` filter, `--page` bounds
- `tests/commands/attach.test.ts` — attach flows: watched alive (switch only), watched dead (auto-resuscitate), unwatched dead (refuse), no-tmux-host (fallback)
- `tests/core/actions.test.ts` — `refresh()` with null jsonlId spawns without `--resume`

**Docs:**
- `README.md` — document `/watched` under a new "Inside Claude Code" section

---

## Task 1: CLI — `claude-watch status --json [--search <q>] [--page <n>]`

Claude needs a machine-readable view of the session list. Existing `status` emits human-formatted text; add a JSON mode + filtering primitives.

- [ ] **Step 1: Write failing tests.** `tests/commands/status.test.ts`:
  - `--json` emits valid JSON, one object per session with fields `{ cwd, jsonlId, name, isWatched, isAlive, brandNew, mtime, lastEvent }`. `brandNew: true` for watched entries with null `pinnedJsonl` and no jsonl on disk yet.
  - `--search <q>` filters to sessions whose cwd, name (basename), or lastEvent contains `q` (case-insensitive substring).
  - `--page <n>` returns the N-th page of `config.pageSize` rows (1-indexed), along with a `page: { current, total }` envelope field.

- [ ] **Step 2: Run tests — expect failure** (flags don't exist).

- [ ] **Step 3: Implement.** In `src/commands/status.ts`, parse new flags, branch on `--json` for output shape. Reuse the session-loading pipeline from `src/picker/hooks/useSessions.ts`' logic (extract the enrichment into a shared function in `src/core/sessions.ts` if it isn't already, so both CLI and picker share it — no duplicated state/tmux enrichment).

- [ ] **Step 4: Run tests — expect pass.** Full suite passes.

- [ ] **Step 5: Lint + commit.**
  ```
  git commit -m "feat(status): add --json, --search, --page for /watched slash command"
  ```

---

## Task 2: CLI — `claude-watch attach <cwd>` (naked switch)

New subcommand that switches focus to the target session's tmux pane, auto-resuscitating only watched+dead sessions.

- [ ] **Step 1: Write failing tests.** `tests/commands/attach.test.ts`:
  - Watched + alive → `tmux switch-client -t <name>` invoked, no state mutation.
  - Watched + dead → driver receives `newSession` first (resuscitate), then `switch-client`.
  - Unwatched + dead → throws with message `not watched — activate first`. No driver calls.
  - Unwatched + alive → `switch-client` invoked, no state mutation.
  - `$TMUX` unset in env → prints fallback `tmux attach -t <name>` instruction to stdout, exits 0 without driver calls.

- [ ] **Step 2: Implement `src/commands/attach.ts`** with signature `export async function runAttach(args: string[]): Promise<void>`. Flow:
  1. Parse `cwd` from args; `normalizeCwd`; `validateCwd`.
  2. Load state, find entry for `cwd`.
  3. If tmux session for cwd exists (`findTmuxForCwd`) → `switch-client` and return.
  4. If state entry exists (watched dead) → call `activate({ cwd, jsonlId: entry.pinnedJsonl ?? <latest discovered> })` then `switch-client`. If no jsonl at all, call the new `refresh(cwd, jsonlId: null)` path to spawn fresh.
  5. If not watched and not alive → throw `not watched — activate first`.
  6. If `!process.env.TMUX` → print fallback instructions instead of calling `switch-client`.

- [ ] **Step 3: Extend `TmuxDriver` interface** with `switchClient(name: string): void`. Real impl runs `tmux switch-client -t <name>`; MockTmuxDriver records the call on a new `switchedTo: string | null` field for test assertion.

- [ ] **Step 4: Register in `src/cli.ts`** under the dispatch table.

- [ ] **Step 5: Run all tests, lint, commit.**
  ```
  git commit -m "feat(cli): add attach subcommand for /watched slash command"
  ```

---

## Task 3: Allow `refresh()` with null jsonlId

For brand-new watched sessions (no jsonl yet), "refresh to pick up a new MCP" is a valid operation. Current `validateJsonlId` throws on null.

- [ ] **Step 1: Write failing test.** `tests/core/actions.test.ts`:
  - `refresh({ cwd, jsonlId: null })` for a watched brand-new cwd kills any existing tmux and spawns fresh via `buildClaudeCmd(null)` (no `--resume` flag). Does not touch watched state.

- [ ] **Step 2: Relax `refresh()`** in `src/core/actions.ts` — change the `jsonlId` param type to `string | null`, skip `validateJsonlId` when null, pass null straight into `buildClaudeCmd`.

- [ ] **Step 3: Run tests, commit.**
  ```
  git commit -m "feat(actions): allow refresh with null jsonlId for brand-new sessions"
  ```

---

## Task 4: Slash command markdown

- [ ] **Step 1: Inspect current plugin manifest.** Check `.claude-plugin/plugin.json` and whether it already declares any `commands`. If not, understand the schema from an existing Anthropic plugin (e.g. `code-review`) and mirror it.

- [ ] **Step 2: Create `commands/watched.md`.** Content outline:

  ```markdown
  ---
  description: Manage claude-watch sessions from inside Claude Code
  argument-hint: "[-s <search query>]"
  ---

  The user wants to manage their claude-watch sessions.

  Arguments: $ARGUMENTS

  1. Run `claude-watch status --json $ARGUMENTS` via Bash.
     - If $ARGUMENTS is empty, run without --search.
     - Parse the JSON output.
  2. Print a numbered list. Each entry: name · age · watched/alive state · cwd.
     Limit to first page; tell the user "type a number, or 'more' for next page"
     if `page.total > 1`.
  3. Wait for the user's reply. They will type a number, or "more", or natural
     language like "the trading one".
     - On "more": run `claude-watch status --json --page <next>` and repeat.
     - On a number or name-match: that's the selected session.
  4. Use `AskUserQuestion` to ask which action to take. Options depend on
     the selected session's state (see action matrix in the plan doc at
     docs/superpowers/plans/2026-04-24-watched-slash-command.md):
     - Unwatched + alive: activate, fork, attach
     - Unwatched + dead: activate, fork
     - Watched + alive (jsonl): deactivate, refresh, fork, attach
     - Watched + dead (jsonl): deactivate, refresh, fork, attach
     - Watched brand-new: deactivate, refresh, attach
  5. If action == fork: ask the user conversationally for the target cwd.
  6. If action != attach: use `AskUserQuestion` to ask "stay in this Claude,
     or continue in the selected session?"
  7. Execute via Bash:
     - attach: `claude-watch attach <cwd>`
     - else + stay: `claude-watch <action> <cwd> [--jsonl <id>]`
     - else + continue: the same, followed by `tmux switch-client -t <name>`
       where `<name>` is the `cwdToTmuxName` — which the CLI prints on success.
  8. Report the outcome concisely.
  ```

  (The actual markdown will be a bit more prescriptive; this is the outline.)

- [ ] **Step 3: Register the command in `.claude-plugin/plugin.json`.** If the manifest doesn't already have a `commands` array, add one.

- [ ] **Step 4: Manually smoke-test.** In a live Claude Code session inside a claude-watch tmux pane:
  - `/watched` — full list, pick by number, pick action, pick disposition.
  - `/watched -s trading` — pre-filtered list.
  - Try attach on a watched+alive session — should just switch panes, no log noise.
  - Try attach on a watched+dead session — should resuscitate silently, then switch.
  - Try fork + continue — should spawn the fork tmux, then switch to it.

- [ ] **Step 5: Commit.**
  ```
  git commit -m "feat(plugin): add /watched slash command for inside-Claude-Code session management"
  ```

---

## Task 5: Docs + final verification

- [ ] **Step 1: README.** Add a section "Inside Claude Code" between "The picker" and "Refresh":

  > ### Inside Claude Code — `/watched`
  >
  > If you're already in a Claude Code conversation, type `/watched` to pick a session, run an action on it, and optionally switch focus to its tmux pane — without leaving the current Claude. Use `/watched -s <query>` to pre-filter by cwd, name, or last-event content.
  >
  > The slash command is a thin adapter over the same CLI the picker uses. Forks, refreshes, activations done via `/watched` are identical to doing them from `claude-watch pick`.

- [ ] **Step 2: Run `bun test`, `bun run lint`, `bun run build`, bundle-freshness sim.**

- [ ] **Step 3: Commit.**
  ```
  git commit -m "docs: document /watched slash command"
  ```

- [ ] **Step 4: Confirm the branch diff:**
  ```
  git log --oneline main..HEAD
  ```

  Expected five new commits on top of the Ink 7 work.
