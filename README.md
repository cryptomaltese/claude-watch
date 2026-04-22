# claude-watch

`/resume` with superpowers — a Claude Code plugin that extends session management.

Claude Code already ships `/resume`: a native picker for recent conversations, scoped across cwds (use `Ctrl+A` to narrow to the current repo, `Ctrl+B` for the current branch). claude-watch keeps that same idea and adds the parts the native picker doesn't try to solve — persistence across SSH drops, auto-resuscitation, remote-control wiring, hot refresh to pick up new MCPs/skills without losing conversation history, and a picker that stays aware of sessions across every cwd you touch.

Everything below is optional. Pick the capabilities you want, enable them via config, and let the install SKILL walk you through the settings.

## What it does

Each item below maps to a config key (see [Config reference](#config-reference)). The [install SKILL](#install) helps you decide which to enable.

- **Cross-cwd session picker with live/dead/watched status.** One view of every session Claude Code has touched, not just the current repo, with color cues for live/dead/watched. Controlled by picker display keys (`peekLines`, `pageSize`).
- **Auto-resuscitation via cron scan.** A watchdog runs every 5 minutes, finds dead tmux sessions for watched cwds, and respawns claude resuming from the correct jsonl. No config toggle — install writes the cron entry; uninstall removes it.
- **Remote Control automation on spawn.** Every new/activated/refreshed session auto-runs `/remote-control` so Desktop and mobile see it within seconds. Controlled by `remoteControl` (default `true`). Set `false` if you never open Desktop.
- **Hot refresh — kill + respawn claude keeping jsonl lineage.** Install a new MCP, edit a skill, update `CLAUDE.md` — refresh from the picker kills the pane and respawns claude with `--resume <id>`. Conversation carries forward; the new config loads on startup. Controlled by `resume` (default `true`).
- **Configurable permission mode.** Spawns pass `--permission-mode <mode>` so you don't hit the native memory-dir prompt on every startup under Desktop. Controlled by `permissionMode` (default `"auto"`) and the nuclear opt-in `dangerouslySkipPermissions` (default `false`).
- **Rich picker UX.** Alt-screen buffer (clean exit), focus/filter cues, transcript peek panel, ripgrep filtering across cwd and transcript content. Tuned via `peekLines` and `pageSize`.
- **Companion SKILLs.** `claude-watch` teaches an in-session claude agent how to operate the plugin; `claude-watch-install` walks a new user through settings, comparing current state against defaults and applying approved changes only.

## Install

Not yet marketplace-listed. Manual install from a clone:

```bash
cd claude-watch
bun install
bun run build
node dist/cli.js install   # writes cron entry, stages binary at ~/.claude-watch/
```

claude-watch reads the following global keys from `~/.claude/settings.json`:

```json
{
  "enableAutoMode": true,
  "permissions": { "defaultMode": "auto" },
  "skipAutoPermissionPrompt": true
}
```

These affect every claude session on the box, not just watched ones. The **`claude-watch-install` SKILL** walks you through each key — reads your current settings, shows the diff, explains the trade-off, applies only what you approve. Invoke it from a claude session after `bun run build`:

> "Use the claude-watch-install skill to set me up."

Requirements: node ≥ 20, ripgrep, cron. tmux is required only for the persistence layer (auto-resuscitation, refresh). If you only want the picker or remote-control automation, tmux isn't mandatory. Runs fine under WSL.

## Core workflows

### The picker

`claude-watch` opens an ink-based picker over every claude session — watched, live, or dormant — newest first. Status column is a three-way join across `~/.claude/projects/`, tmux state, and `watched.json`. Type to filter on cwd or transcript content (ripgrep). Enter opens an action menu. Runs on the alternate screen buffer, so quitting restores your shell cleanly.

### Refresh (the feature you probably came for)

You installed a new MCP, edited a skill, or updated `CLAUDE.md`. You want the running claude to pick up the change without losing the conversation.

Highlight the session, hit enter, pick **refresh**. claude-watch kills the tmux pane and respawns claude resuming from the same jsonl. History carries forward; new config loads on startup. Use **refresh + attach** to drop into the pane afterwards.

### New session

`ctrl-n` from the picker, or `claude-watch new <dir>`. Creates the directory if needed, spawns a fresh claude in a new tmux session, auto-activates `/remote-control`.

### Remote access

Every spawn (new, activate, refresh) tries `/remote-control` up to three times with backoff. If it confirms, the session shows up in Desktop and mobile without extra steps. If it doesn't, claude-watch logs a warning and moves on — the session is still alive, you just activate RC manually.

### Auto-resuscitation

Cron runs `claude-watch scan` every 5 minutes. For each entry in `watched.json`: if the tmux session is dead, validate the pinned jsonl (fallback chain if malformed), respawn claude resuming from the latest jsonl for that cwd, re-activate remote-control. Healthy sessions are a no-op.

## Config reference

Optional file at `~/.claude-watch/config.json`. Source of truth: [`src/core/config.ts`](src/core/config.ts).

| Key | Default | What it does |
|---|---|---|
| `peekLines` | `7` | Transcript peek lines shown in the picker |
| `pageSize` | `10` | Picker page size |
| `remoteControl` | `true` | Auto-activate `/remote-control` on spawn |
| `resume` | `true` | Resume from latest jsonl on respawn vs. start fresh |
| `permissionMode` | `"auto"` | Passed via `--permission-mode`. `auto` routes through the classifier, which allows routine memory writes. |
| `dangerouslySkipPermissions` | `false` | Adds `--dangerously-skip-permissions`. Opt-in; hits the native memory-dir prompt. |

Env vars:

| Variable | Effect |
|---|---|
| `CLAUDE_WATCH_CONFIG_DIR` | Override `~/.claude-watch/` |
| `CLAUDE_WATCH_PROJECTS_DIR` | Override `~/.claude/projects/` |
| `CLAUDE_WATCH_DEBUG=1` | Debug logging to `~/.claude-watch/claude-watch.log` |

## Commands

| Command | Description |
|---|---|
| `claude-watch` / `pick` | Open the picker |
| `claude-watch scan` | Run one watchdog cycle (cron entrypoint) |
| `claude-watch status` | Show watched sessions and their live/dead state |
| `claude-watch new <dir>` | Create and watch a new session |
| `claude-watch activate <dir>` | Start watching an existing cwd (`--jsonl <id>` to pin) |
| `claude-watch deactivate <dir>` | Stop watching (`--no-kill` to leave tmux alive) |
| `claude-watch logs [n]` | Tail the log |
| `claude-watch install` | Write cron entry, stage stable binary |
| `claude-watch uninstall` | Remove cron entry |

## Under the hood

State lives in `~/.claude-watch/watched.json` — a flat list of `{ cwd, pinnedJsonl, pinnedAt }` entries, guarded by a file lock on every mutation. The scan loop is idempotent: reads watched.json, checks tmux, rolls `pinnedJsonl` forward to the newest jsonl for that cwd, respawns only what's dead.

Picker session discovery walks `~/.claude/projects/` — the same directory `/resume` reads. Each jsonl file corresponds to one session; claude-watch indexes them, joins with tmux state and `watched.json`, ranks by last-modified.

Tmux integration is a thin driver over `tmux new-session`, `has-session`, `capture-pane`, `send-keys`, `kill-session`. Session names derive from cwd via a stable slug; when a session with an arbitrary name is already running in a watched cwd, claude-watch adopts it instead of spawning a duplicate.

Full design spec: [`docs/superpowers/specs/`](docs/superpowers/specs/). Rewrite plans and open work: [`docs/superpowers/plans/`](docs/superpowers/plans/).

## Known caveats

- **Footprint.** Install writes a cron entry, copies a stable binary to `~/.claude-watch/bin/claude-watch`, and expects global changes in `~/.claude/settings.json`. Uninstall removes the cron entry only — not the binary, not the settings changes. The `claude-watch-install` SKILL walks through every modification before applying.
- **Permission model shift.** The recommended `defaultMode: "auto"` applies to *all* claude sessions on the box. If you run workflows that rely on prompt-every-time, they'll behave differently.
- **Remote-control is best-effort.** Three retries, then claude-watch logs and moves on. Session stays alive; run `/remote-control` yourself if needed.
- **Single-user.** Assumes one user with one `~/.claude/`.
- **Desktop sidebar lingers after refresh.** When you `refresh` a session, Claude Desktop keeps the dead session listed in its sidebar alongside the new one. You have to click the new entry once to switch. Out of our control — Desktop doesn't garbage-collect stale Remote Control registrations on its own.

## Development

```bash
bun install
bun test       # temp dirs, mock tmux, no live sessions required
bun run build  # bundles to dist/cli.js
```

The pre-commit hook auto-rebuilds when `src/` changes. CI runs lint, tests, build, a bundle-freshness gate, and a wrapper smoke test.

## Contributing

Issues and PRs welcome. Before opening a PR, please run `bun test` and `bun run lint`. For non-trivial changes, a plan or spec doc under `docs/superpowers/` is appreciated.

## License

MIT
