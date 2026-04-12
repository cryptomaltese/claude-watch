# claude-watch — Interactive Picker & Full TypeScript Rewrite

**Date:** 2026-04-12
**Status:** Approved for implementation planning
**Replaces:** bash-based claude-watch v0.1.0 at `bin/claude-watch`

## Goals

1. Make managing persistent Claude Code sessions frictionless: pick any existing session (active, recent, or forgotten), turn on watchdog management, optionally attach.
2. Ship as a Claude Code plugin that installs with zero post-install fiddling.
3. Match Claude Code's own look and feel so the tool feels native to its ecosystem.
4. Consolidate bash + TypeScript logic into a single cohesive codebase.

## Non-goals (V1)

- Multi-host / machine sync of watched state.
- Concurrent users on the same machine.
- Windows support (POSIX-only; requires cron).
- Replacing or routing around custom Claude Code storage backends (escape hatch provided).

## Context

The existing bash implementation works but has accumulated design debt:

- Discovery is directory-scan based. Finds too many or too few things depending on config.
- `~/.claude-watch/config.json` has grown flags (`sessionsDir`, `prefix`, per-session overrides) that no longer match how the tool is actually used.
- Tmux session naming collides when two cwds share a basename.
- There is no interactive way to say "watch this specific past conversation".

This spec replaces that design end-to-end. The bash script is deleted in favor of a single TypeScript codebase built with bun and bundled into `dist/cli.js`.

## User model

The tool exposes exactly one bit of state per cwd: **watched** (on/off).

- **On** = entry exists in `watched.json`. The scan cron will resume this session if it dies.
- **Off** = no entry. No management.

The primary interaction is a picker (`claude-watch` with no arguments) that shows every Claude Code session on the machine, newest first, and lets the user flip its watched state. The picker never creates sessions from scratch; it only manages sessions that already exist in `~/.claude/projects/`.

### The four user flows the picker serves

In decreasing likelihood:

1. Pick an active session that was started manually → turn it on.
2. Pick a recent archived session → resume + turn it on.
3. Pick an older archived session → resume + turn it on.
4. Search by keyword/phrase in the transcript to find a forgotten session → resume + turn it on.

All four flows run through the same picker screen.

## Architecture

### Technology choices

- **Language**: TypeScript throughout.
- **TUI framework**: Ink (React for terminal). Chosen because Claude Code itself is Ink-based; sharing the stack is the shortest path to a claude-like aesthetic and to future web portability via `react-dom`.
- **Build tool**: bun (`bun build src/cli.ts --target=node --bundle --outfile dist/cli.js --minify`). Ships a single ~3 MB bundled JS file. Runtime is plain node ≥20.
- **Test runner**: `bun test`.
- **Single codebase**: No bash core + TS picker split. Everything is TS. The 30 ms node cold start for `scan` is acceptable inside cron.

### Module layout

```
claude-watch/
├── .claude-plugin/plugin.json     # Claude Code plugin manifest
├── package.json
├── tsconfig.json
├── bin/claude-watch               # bash wrapper — sentinel handoff for attach
├── dist/cli.js                    # committed bundle (built by bun)
├── hooks/hooks.json               # hook declaration
├── skills/claude-watch/SKILL.md   # the skill (renamed from "watchdog")
├── src/
│   ├── cli.ts                     # command dispatch
│   ├── core/
│   │   ├── slug.ts                # path ↔ slug (reversible with fs probing)
│   │   ├── sessions.ts            # walk ~/.claude/projects, read jsonls
│   │   ├── tmux.ts                # injectable TmuxDriver interface
│   │   ├── state.ts               # watched.json read/write + roll-forward
│   │   ├── config.ts              # ~/.claude-watch/config.json
│   │   ├── notices.ts             # deferred user messages
│   │   ├── log.ts
│   │   └── hooks/sessionStart.ts  # SessionStart hook logic (bundled)
│   ├── commands/
│   │   ├── scan.ts                # cron entrypoint
│   │   ├── pick.ts                # Ink picker entry
│   │   ├── status.ts
│   │   ├── activate.ts            # headless
│   │   ├── deactivate.ts          # headless
│   │   ├── logs.ts
│   │   ├── install.ts
│   │   ├── uninstall.ts
│   │   └── _hook.ts               # internal: dispatches hook events
│   └── picker/
│       ├── App.tsx
│       ├── SessionList.tsx
│       ├── PeekPanel.tsx
│       ├── ActionMenu.tsx
│       └── hooks/
│           ├── useSessions.ts
│           └── useSearch.ts
├── README.md                      # user-facing + Development section
├── LICENSE
└── tests/                         # mirrors src/ structure
```

### Boundaries

- `core/` is pure logic. No process spawning or terminal I/O outside of well-typed driver interfaces (like `TmuxDriver`). Easy to unit-test.
- `picker/` depends only on `core/`. Ink components are thin views over state + actions.
- `commands/` are the dispatch targets for `cli.ts`. Each command imports from `core/`; the picker command also imports from `picker/`.
- `core/` functions are the single source of truth for state mutations. Both `scan.ts` and the picker call into `core.activate()` / `core.deactivate()`.

## Data model

### `~/.claude-watch/watched.json`

```json
{
  "version": 1,
  "entries": [
    {
      "cwd": "/home/maltese/.openclaw/workspace/sessions/ktap",
      "pinnedJsonl": "4f2bf4db-4dc0-435d-8741-233601fea897",
      "pinnedAt": "2026-04-11T14:32:00Z"
    }
  ]
}
```

Tmux session name is derivable from `cwd` via the slug function — not stored.

### Reading Claude Code sessions

Source of truth: `~/.claude/projects/*/*.jsonl`. Resolves via this fallback chain:

1. `$CLAUDE_WATCH_PROJECTS_DIR` (explicit override)
2. `$CLAUDE_HOME/projects` if `$CLAUDE_HOME` is set
3. `~/.claude/projects` (default)

The internal session shape:

```ts
type Session = {
  jsonlPath: string         // absolute path to the .jsonl file
  jsonlId: string           // the uuid portion of the filename
  slug: string              // project slug from ~/.claude/projects
  cwd: string | null        // reversed from slug; null if unresolvable
  mtime: Date               // from fs.stat
  lastEvent: string         // last jsonl event rendered as text (role: content),
                            //   author-agnostic, truncated to 100 chars
  isWatched: boolean        // cwd is in watched.json
  isAlive: boolean          // tmux has-session by slug name
}
```

The peek (last N events of the transcript, default 7, configurable) is loaded lazily when a row is selected — not stored on every row. Each event renders to a single text line (long lines truncate with ellipsis at the panel width).

### Slug ↔ path round trip

- **Path → slug**: replace `/` and `.` with `-`, drop leading `/`, prepend `-`. Example: `/home/maltese/.openclaw/workspace/sessions/ktap` → `-home-maltese--openclaw-workspace-sessions-ktap`.
- **Slug → path**: ambiguous because both `/` and `.` become `-`. Reverse by substituting `-` → `/`, then probe the filesystem to find which of the candidate paths exists, biasing known dot-prefix dirs (`.openclaw`, `.claude`, `.config`, `.local`, `.ssh`). If no candidate exists, return `null`.
- Tmux session name is the slug itself: `claude-<slug>`. Ugly but collision-free and reversible.

### Roll-forward semantics (Hybrid pinning, option C from brainstorm)

On every `scan()`:

```
for each entry in watched.json:
    latest = newest jsonl in ~/.claude/projects/<slug>/ where mtime > entry.pinnedAt
    if latest:
        entry.pinnedJsonl = latest.jsonlId
        entry.pinnedAt = latest.mtime
        persist()
    if tmux session not alive:
        validateAndResume(entry)
```

The picker pins what the user clicks. Cron follows the conversation forward as new jsonls appear.

### Concurrency

`watched.json` writes use **atomic rename**: write to `watched.json.tmp` then `fs.renameSync`. All mutations of `watched.json` (from `scan`, from the picker's `activate`/`deactivate`, from the headless CLI commands) acquire `proper-lockfile` on `~/.claude-watch/state.lock` before the read-modify-write sequence. This prevents the race where cron reads state, the picker writes an update, then cron's stale write clobbers the picker's change. Overlapping cron ticks see a held lock and exit silently; the picker retries briefly before surfacing a lock-contention error.

### Config file (optional)

`~/.claude-watch/config.json`:

```json
{
  "peekLines": 7,
  "pageSize": 10,
  "remoteControl": true,
  "resume": true
}
```

Defaults are used if the file is missing or malformed (malformed → file renamed to `.broken-<timestamp>`, defaults used, warning logged).

Old bash keys (`sessionsDir`, `prefix`, `sessions.<name>.flags`) are dropped. Not migrated.

### Env var overrides

- `$CLAUDE_WATCH_CONFIG_DIR` — overrides the entire `~/.claude-watch/` state dir (watched.json, config.json, log, state.lock, notices). Primarily for testing; documented but not advertised for end users.
- `$CLAUDE_WATCH_PROJECTS_DIR` — overrides the Claude Code jsonl source (see "Reading Claude Code sessions" above).
- `$CLAUDE_WATCH_DEBUG=1` — enables debug-level logging.

## Commands

| Command | Purpose | Interactive? |
|---|---|---|
| `claude-watch` (default) | Open the picker | yes |
| `claude-watch pick` | Alias for default | yes |
| `claude-watch scan` | One watchdog cycle — cron entrypoint | no |
| `claude-watch status` | Non-interactive table of watched entries | no |
| `claude-watch activate <cwd> [--jsonl <id>]` | Headless activate | no |
| `claude-watch deactivate <cwd> [--no-kill]` | Headless deactivate; default kills tmux, `--no-kill` preserves it | no |
| `claude-watch logs [n]` | Tail last n lines of log (default 50) | no |
| `claude-watch install` | Write cron entry + stable install copy | no |
| `claude-watch uninstall` | Remove cron entry | no |
| `claude-watch version` | Print version from `package.json` | no |
| `claude-watch help` | Print help | no |

Removed from the bash version: `start`, `stop`, `restart`, `list`, `add`.

### `scan` (cron entrypoint)

```
1. load watched.json (with lock)
2. for each entry:
     a. roll forward if a newer jsonl exists
     b. if tmux session not alive:
          validateAndResume(entry)
3. log summary
4. exit 0
```

### `validateAndResume(entry)` — malformed jsonl recovery

```
candidates = [entry.pinnedJsonl, ...other jsonls in slug sorted by mtime desc]
for each candidate:
    if validate(candidate):
        try claude --resume <candidate> --fork-session ...
        if success:
            if candidate != entry.pinnedJsonl:
                rename pinnedJsonl to <id>.jsonl.broken-<ts>
                update entry.pinnedJsonl = candidate
                warn: "recovered from <candidate> — pinned was malformed"
            return
// all candidates failed
start fresh session (no --resume)
warn: "no recoverable jsonl; started fresh in <cwd>"
```

`validate()` reads the last 4 KB of the jsonl, splits on newline, verifies the last non-empty line parses as JSON with the expected Claude Code message shape.

### `pick` flow

```
1. loadSessions() → all jsonls, mtime desc
2. Ink renders first pageSize (10) rows
3. user types → debounced ripgrep → filter
4. ↑↓ navigate, ↵ select
5. peek lazy-loads (tail N lines), ActionMenu renders
6. user picks action:
     off → on:  ↵ activate  /  ctrl-↵ activate + attach
     on → off:  ↵ deactivate  /  ctrl-↵ deactivate + attach (keeps tmux)
7. on +attach actions → write sentinel file, exit 0
8. bash wrapper reads sentinel, execs `tmux attach -t <slug>`
```

### Sentinel file mechanics

Bash wrapper at `bin/claude-watch`:

```bash
#!/usr/bin/env bash
set -euo pipefail
SENTINEL=$(mktemp -t claude-watch-attach.XXXXXX)
export CLAUDE_WATCH_SENTINEL="$SENTINEL"
node "$(dirname "$(realpath "$0")")/../dist/cli.js" "$@"
RC=$?
if [ -s "$SENTINEL" ]; then
    TARGET=$(cat "$SENTINEL")
    rm -f "$SENTINEL"
    exec tmux attach -t "$TARGET"
fi
rm -f "$SENTINEL"
exit $RC
```

TS side writes the tmux session name to `process.env.CLAUDE_WATCH_SENTINEL` on attach actions, then exits cleanly. `exec` replaces the wrapper so the user's shell lands directly in tmux.

### State transitions

```
activate(cwd, jsonlId, attach=false):
  1. verify cwd exists on disk
  2. upsert watched.json entry (pinnedJsonl, pinnedAt=now)
  3. if tmux session not alive → start it with --resume <jsonlId> --fork-session
  4. remote-control activation via tmux send-keys (3 retries × 10s)
  5. if attach → write sentinel with tmux name

deactivate(cwd, kill=true, attach=false):
  1. remove watched.json entry (under state.lock)
  2. if kill → tmux kill-session -t <slug>
  3. if attach → write sentinel with tmux name
     (tmux dies when user exits claude inside it; if they detach
      (ctrl-b d), it lives on unmanaged until they kill it or
      re-activate it from the picker)

Picker-to-core mapping:
  off→on  ↵       → activate(cwd, jsonlId, attach=false)
  off→on  ctrl-↵  → activate(cwd, jsonlId, attach=true)
  on→off  ↵       → deactivate(cwd, kill=true,  attach=false)
  on→off  ctrl-↵  → deactivate(cwd, kill=false, attach=true)

Headless CLI mapping:
  claude-watch activate <cwd>            → activate(cwd, latest, attach=false)
  claude-watch activate <cwd> --jsonl X  → activate(cwd, X,      attach=false)
  claude-watch deactivate <cwd>          → deactivate(cwd, kill=true,  attach=false)
  claude-watch deactivate <cwd> --no-kill→ deactivate(cwd, kill=false, attach=false)
```

## Picker UX

### Screens

Two screens. Modal: user is on one or the other.

**List screen** — default on launch. Shows sessions sorted by mtime desc, paginated by `pageSize` (default 10). Each row displays:

```
● ktap              5m ago      watched
  /home/maltese/.openclaw/workspace/sessions/ktap
  "looks right. save the params and move on"
```

- `●` (watched) or `○` (not watched)
- basename of cwd
- relative time since mtime
- status tag (only if watched)
- dim cwd path (full)
- dim `lastEvent` (last jsonl event rendered as text, author-agnostic, 100 chars)

Three lines per row, one blank line between rows.

**Action screen** — after pressing `↵` on a row. Shows the peek (last 7 transcript lines) and the available actions for the current state. Modal transition via `esc` to go back.

### Keybindings

**List screen:**
- type anything → filters (deep ripgrep, debounced 150 ms)
- `↑` / `↓` → move selection
- `pgup` / `pgdn` → page, load next/prev 10
- `home` / `end` → first / last of loaded set
- `↵` → select row → action screen
- `backspace` → edit search query
- `ctrl-u` → clear search query
- `esc` / `ctrl-c` → quit
- `ctrl-d` → hard quit

**Action screen:**
- `↵` → primary action (activate or deactivate depending on state)
- `ctrl-↵` → secondary action (same + attach)
- `esc` / `←` → back to list
- `q` → quit entirely

### Search

Default and only search mode is **deep**: `rg -l <query> ~/.claude/projects/*/*.jsonl` one-shot, debounced 150 ms. Case-insensitive, literal (not regex), matches across user + assistant + tool output. Results cap at 100 matches with a "refine query" hint.

Empty query → show unfiltered list.
Non-empty query with matches → filtered list.
Non-empty query with no matches → `No sessions found with "{query}"`.

### Aesthetic details

- Rounded single-line borders (Ink's `borderStyle="round"`) around panels
- Beige-on-charcoal palette: `#e8dfcf` text on `#1a1a1a`, `#888` for dim secondary
- Accent `#cc7b2e` (CC orange) for selection and watched indicator
- Breathing whitespace: 1 blank line between rows, 2 between sections, panel padding of 1
- Always-visible footer showing per-screen keybind hints
- Top status line: `23 sessions · 3 watched · filter: ktap`
- No fade/slide animations — match Claude Code's instant re-render

### Loading states

- Launch: skeleton rows shown only if `loadSessions()` takes longer than ~100 ms (usually invisible).
- Peek open: "reading transcript…" placeholder, typically <10 ms.
- Action dispatch: spinner in the ActionMenu, replaced with `✓ activated` briefly before exit.

### Non-interactive fallback

If stdout is not a TTY, `pick` errors out:
```
claude-watch pick requires a TTY. Use status, activate, or deactivate instead.
```
Exit code 2.

## Packaging & install

### Hard dependencies (runtime)

All three are mandatory and cause a hard fail with a precise error message:

- **tmux** — for session management
- **ripgrep** (`rg`) — for deep search in the picker
- **cron** (or `crontab` binary, any cron daemon) — for scheduled scans

No fallbacks. Missing any → exit 127 with an install-guidance error message. The skill further helps the user by detecting OS + package manager and running the install.

Also required:
- **node ≥ 20** (declared in `package.json` `engines`)

### Install layout

`claude-watch install` creates a stable self-contained copy, decoupled from plugin versioning:

```
~/.claude-watch/
├── bin/claude-watch        ← copy of the wrapper
├── dist/cli.js             ← copy of the bundle
├── config.json             ← user config (optional)
├── watched.json            ← state
├── notices                 ← append-only deferred messages
├── state.lock              ← proper-lockfile for watched.json mutations
└── claude-watch.log
```

Cron entry points at `~/.claude-watch/bin/claude-watch`. Never changes after first install.

### First-install flow

```
1. User: /plugin install claude-watch
2. Claude Code clones the plugin to ~/.claude/plugins/cache/.../claude-watch/<version>/
3. User runs any interactive claude-watch command (or the /claude-watch slash command)
4. check_install() detects missing bin + cron → ONE interactive prompt:
     "claude-watch is not installed yet. Install now? [Y/n]"
5. On yes → install runs, writes bin + cron, proceeds to the originally-requested command
6. On no → save ~/.claude-watch/.install-declined, show dim footer on subsequent runs
```

The only friction point is step 4. Everything else is silent.

### Plugin update flow

On every interactive invocation after the initial install:

```
check_install():
  1. bin + cron present? If not → re-run first-install flow
  2. sha256(plugin dist/cli.js) == sha256(~/.claude-watch/dist/cli.js)?
     If yes → proceed
     If no → attempt silent refresh (overwrite stable copy)
       On success → proceed with no user-visible message
       On failure → increment retry counter, log error
         counter < 3 → proceed silently
         counter ≥ 3 → prompt: "auto-update has failed 3 times. Show diagnostics?"
```

Normal users see one prompt, ever. Persistent failure surfaces only after sustained pain.

### Uninstall

`claude-watch uninstall`:
- Removes cron entry
- Leaves `~/.claude-watch/` alone (config, state, logs). Explicit `rm -rf ~/.claude-watch` required to fully remove.

### Hooks

One hook: **SessionStart**. Validates the user's Claude Code configuration for watchdog compatibility without modifying anything.

Declared in `hooks/hooks.json`, implemented in `src/core/hooks/sessionStart.ts`, bundled into `dist/cli.js`, invoked as `claude-watch _hook session-start` (underscore-prefix marks internal verbs, not shown in `help`).

Checks:
- `~/.claude/settings.json` has `permissions.defaultMode: "bypassPermissions"` — warns if not, because without it resumed sessions will prompt for permissions
- Current cwd's `.claude/settings.local.json`, if present, doesn't have a non-empty `permissions.allow` list (which would override bypass mode)

Emits warning JSON on failure. Never blocks.

### Build

```bash
bun build src/cli.ts \
  --target=node \
  --outfile=dist/cli.js \
  --minify \
  --banner="#!/usr/bin/env node"
```

Bundle size: ~3 MB (Ink + React + yoga-wasm-web inlined). Committed to git.

**Pre-commit hook (husky)**:
```bash
if git diff --cached --name-only | grep -qE '^src/'; then
  bun run build
  git add dist/cli.js
fi
```

**CI**: strict bundle-freshness gate. `bun run build` must produce a `dist/cli.js` identical to the committed one, or CI fails with a diff.

## Error handling & edge cases

### Severity levels

| Severity | Definition | Visibility |
|---|---|---|
| **error** | Prevents an action | stderr, exit ≠ 0, logged |
| **warn** | Action completed but degraded or surprising | stderr during command, logged |
| **notice** | Deferred / async event the user should know next time they run an interactive command | Shown at top of next interactive run, persisted in `~/.claude-watch/notices` until dismissed |
| **info** | Normal operation / debugging | Log only |
| **debug** | Internals, `CLAUDE_WATCH_DEBUG=1` to enable | Log only when enabled |

### Cases handled

**Filesystem / state**
- `~/.claude-watch/` missing → `mkdir -p` silently on first run
- `watched.json` corrupt → rename to `.broken-<ts>`, start empty, log error
- `watched.json` entry for cwd that no longer exists on disk → prune on next scan (**notice** on first detect)
- Concurrent scan / picker / CLI writes → all acquire `proper-lockfile` on `state.lock`, losers retry briefly or exit silently
- `~/.claude/projects/` missing → treat as empty, picker shows diagnostic
- Unreversible slug (same root cause as the cwd-deleted case, different code path): the project is hidden from the picker. No user action possible.

**Tmux**
- tmux binary missing → **hard fail**, exit 127, SKILL helps install
- `has-session` non-zero unexpectedly → treat as not alive; `new-session` will reject duplicates anyway
- `new-session` fails → log, surface to picker as "failed to start — check logs"
- External tmux session with our exact name → refuse to manage (**warn**)
- `tmux attach` on dead session → wrapper prints `session not found — was it just killed?`, exit 1

**Claude / resume**
- Malformed jsonl → fallback chain through other jsonls in slug (**warn**), mark broken file with `.broken-<ts>` rename
- Remote-control activation fails 3x → **warn** during scan, session stays running (usable, just not remote-controllable)
- `--fork-session` rejected → retry without, log if that also fails

**Ripgrep**
- rg missing → **hard fail**, exit 127, SKILL helps install
- Huge result set → cap at 100, show "refine query" hint

**Ink / terminal**
- Non-TTY stdout → `pick` errors with TTY requirement
- Terminal too small (<20 cols or <10 rows) → minimal "terminal too small" message
- Mid-session resize → Ink reflows natively
- `ctrl-c` mid-load → cancel, exit 130

**Install / launcher**
- `crontab` missing → **hard fail**, exit 127, SKILL helps install (no systemd fallback)
- Auto-refresh fails → retry 3× silently, then prompt
- User deletes `~/.claude-watch/` manually → next invocation re-runs first-install

**Paths**
- Non-POSIX characters in cwd (`$`, `` ` ``, `\`, `"`, `'`, `#`) → **warn** at activate, proceed with proper quoting
- Tab or newline in cwd → **error**, refuse to activate, suggest rename
- All generated commands use argv arrays (`spawn` with `shell: false`), except the cron line which uses single-quote escaping

**Storage**
- Custom Claude Code storage backends → use `$CLAUDE_WATCH_PROJECTS_DIR` or `$CLAUDE_HOME` env vars; no runtime detection, documented as escape hatch

### Logging

All errors logged to `~/.claude-watch/claude-watch.log`. Unstructured but greppable. Rotates at 10 MB (rename to `.1`, truncate; keep last 3). No telemetry.

## Testing

### Runner

`bun test` — built-in, runs TS + JSX natively, no additional config.

### Layers

| Layer | Approach | Coverage target |
|---|---|---|
| Unit (pure functions) | Direct calls, no I/O | ≥95% of `src/core/` |
| Core (I/O via temp dirs) | `makeFixture()` helper creates `~/.claude-watch/` and `~/.claude/projects/` in a tempdir; tests set env vars to point at the fixture | ≥80% overall |
| Process (real tmux) | Unique `-S <socket>` per test, 3-4 smoke tests | Critical paths |
| Picker (Ink) | `ink-testing-library` snapshot + keypress simulation | Every screen × every key |
| Wrapper (bash) | Single smoke test: fake `dist/cli.js` writes sentinel, fake `tmux` records args, assert `exec tmux attach -t <target>` happens | 1 test |

### Key abstractions for testability

- **`TmuxDriver` interface**: `core/tmux.ts` exports a default shell-backed driver and accepts an injectable mock in tests.
- **Fixture helper**: `tests/helpers/fixture.ts` provides `makeFixture()` → `{ root, projectsDir, stateDir, addSession, addWatched, readWatched, cleanup }`.
- **Environment indirection**: `$CLAUDE_WATCH_PROJECTS_DIR` and `$CLAUDE_WATCH_CONFIG_DIR` let tests point the real code at temp dirs without mocking.

### CI pipeline

```
1. checkout
2. install bun
3. apt install tmux ripgrep
4. bun install
5. bun run lint       (tsc --noEmit + eslint)
6. bun test           (all layers)
7. bun run build      (produces dist/cli.js)
8. git diff --exit-code dist/cli.js   (strict bundle freshness)
9. tests/wrapper-smoke.sh
```

Step 8 is strict: committed `dist/cli.js` must be identical to the output of `bun run build`. The pre-commit hook is the local belt; CI is the suspenders.

### Not tested in V1

- Real `claude` CLI invocations (too variable)
- Real cron scheduling (test that `install` writes the right line, trust cron to read it)
- Load testing at 1000+ sessions (only if profiling reveals a perf complaint)

## Migration from the bash version

The existing bash `claude-watch` at `bin/claude-watch` is deleted. Config keys that no longer exist (`sessionsDir`, `prefix`, `sessions.<name>.flags`) are silently ignored if present in an old `config.json` — no migration script. State from the old bash version (`watched` directories derived by filesystem scan) is not migrated because the bash version did not persist a watched set; it discovered dynamically on every scan. Users must run through the picker once to declare which sessions they want watched.

## Dependencies

### Runtime
- node ≥20
- tmux
- ripgrep
- cron (any daemon)

### NPM dependencies (bundled)
- `ink` ^5
- `react` ^18
- `proper-lockfile` ^4

### NPM devDependencies
- `@types/node` ^22
- `@types/react` ^18
- `typescript` ^5.5
- `husky` ^9
- `ink-testing-library` (for test)

## Open questions for implementation phase

- Does `$CLAUDE_HOME` exist in current Claude Code versions? If not, that fallback chain entry is dead weight and should be dropped. Verify before implementing `core/sessions.ts`.
- What exact key sequence does Claude Code use for `ctrl-↵`? Ink's `useInput` may need `modifyOtherKeys` enabled. Verify in a spike before committing to the keybind.
- Exact `plugin.json` schema for hooks — need to verify how Claude Code's plugin loader maps `hooks.json` entries to invocations. Confirm during scaffolding.
