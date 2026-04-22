# Claude Code integration tracks for claude-watch

Research date: 2026-04-20. Claude Code 2.1.112. Evidence from `strings` extraction of
`/home/linuxbrew/.linuxbrew/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe`
plus inspection of reference plugins (superpowers, code-review).

## Summary of new primitives confirmed (both tracks depend on these)

- **Hook events (full list, wider than we knew)**: `PreToolUse, PostToolUse, PostToolUseFailure,
  Notification, UserPromptSubmit, SessionStart, SessionEnd, Stop, StopFailure, SubagentStart,
  SubagentStop, PreCompact, PostCompact, PermissionRequest, PermissionDenied, Setup,
  TeammateIdle, TaskCreated, TaskCompleted, Elicitation, ElicitationResult, ConfigChange,
  WorktreeCreate, WorktreeRemove, InstructionsLoaded, CwdChanged, FileChanged`.
- **`SessionStart` hook payload** fires with `source: "startup"|"resume"|"clear"|"compact"` and
  the output supports `hookSpecificOutput: { additionalContext, initialUserMessage, watchPaths }`
  — we can detect a resume AND inject a first user message AND subscribe to file watches.
- **`UserPromptSubmit` hook output**: `{ additionalContext, sessionTitle }` — can prepend
  context and mutate the displayed session title, cannot cancel the prompt.
- **Slash commands** are prompt templates (markdown + YAML frontmatter). Frontmatter fields:
  `allowed-tools`, `disable-model-invocation`, `description`, `argument-hint`, `model`,
  `$ARGUMENTS` body substitution. Every `/cmd` flows through the assistant turn — there is
  no primitive for "run this locally without the model" (unlike built-in `/clear`).
- **Plugin `monitors/monitors.json`** (undocumented): "persistent background monitor… each
  stdout line is delivered to the model as a `<task_notification>` event; runs for the session
  lifetime". Unsandboxed, same trust tier as hooks. This is the closest thing to a
  long-running plugin worker.
- **New CLI flags** relevant to us: `--session-id <uuid>`, `-n/--name <name>` ("shown in the
  prompt box, `/resume` picker, and terminal title"), `--plugin-dir <path>` (repeatable,
  session-scoped plugin loader).

## Track A — hook into / augment native `/resume`

### 1. Feasibility
- **Blocked**: pre-picker interception. The `/resume` picker and `claude --resume` UI render
  *before* any hooks fire (no `SessionSelect`, `PreResume`, etc. in the enum). You cannot
  replace the native list, inject entries, or decorate rows from a plugin.
- **Blocked**: registering a plugin command named `/resume`. Plugin commands are
  namespaced `plugin:name` or appear under their own slug; built-in names win.
- **Possible**: post-selection hookup. `SessionStart` fires with `source: "resume"` and a
  `session_id`/`transcript_path`/`cwd` payload. That is where claude-watch can adopt the
  chosen jsonl, register it in `watched.json`, emit the banner, rearm tmux, etc.
- **Possible, UX-only**: a shell wrapper around `claude --resume`. Since `--resume` either
  takes a UUID/title or drops into the native picker, we can ship a wrapper that (a) runs
  claude-watch picker first then exec's `claude --resume <uuid>`, or (b) falls through to
  native. `--plugin-dir` can layer claude-watch on top of whatever session is resumed.
- **Unknown**: whether `-n/--name` is writable post-session-start via a hook (the string
  "saveCustomTitle/cacheSessionTitle" exists as an exported API but we don't know if plugins
  have a write path). Probably only via `UserPromptSubmit.sessionTitle` output.

### 2. Integration points
- `SessionStart` with `source="resume"` → adopt jsonl, write to watched.json, respawn tmux
  wrapper if needed, emit `hookSpecificOutput.additionalContext` informing the assistant the
  session is watched.
- `UserPromptSubmit.sessionTitle` → set title to `[watched] <slug>` so the native `/resume`
  picker row is visually distinct on next cold start.
- Shell wrapper `claude-watch resume` → thin TUI over our watched.json, then
  `exec claude --resume <uuid> --name <slug>`.
- `--plugin-dir` boot: wrapper can inject the claude-watch plugin for the resumed session
  only, without requiring global install.

### 3. UX options
1. **Banner-only** (lowest friction). No wrapper. `SessionStart` hook detects resume, emits
   `additionalContext` "claude-watch: adopted session abc into watched.json, last scan 2m
   ago". Zero behavior change otherwise. Pro: invisible until needed. Con: user still has to
   know to type `claude --resume`.
2. **Wrapper-replaces-picker**. Alias `claude` → `claude-watch launch` which presents the
   claude-watch picker (watched + orphan + new), then execs native. Pro: single entrypoint.
   Con: hijacks the canonical CLI, breaks muscle memory, fights native UI updates.
3. **Wrapper alongside**. Keep `claude --resume` native. Add `cw resume` as the
   watched-first variant that falls through to native when user asks. Pro: respects native.
   Con: two commands to remember.

### 4. Experiments
- Confirm SessionStart fires for `claude --resume <uuid>` (resume path, not startup) and the
  payload contains `transcript_path`.
- Verify `hookSpecificOutput.sessionTitle` actually persists into the `/resume` picker on
  next launch (may only affect current session display).
- Check whether `--plugin-dir` injected on resume loads commands/hooks into the resumed
  session or only applies to newly-started sessions.
- Measure: does `SessionStart` run blocking or async? We need `async: false` for adoption to
  complete before the first turn.

### 5. Recommendation
**Option 3 (wrapper alongside) + `SessionStart`-driven adoption**. Ship `cw resume` for
watched-first flow, and have the plugin's `SessionStart` hook retroactively adopt any
session the user resumes via native `/resume`. This avoids fighting the native UI while
guaranteeing watched.json stays consistent regardless of entrypoint.

## Track B — `/cw` inside a running claude session

### 1. Feasibility
- **Blocked**: TUI takeover. A slash command is a prompt template; it executes inside the
  assistant's turn. A command cannot seize the terminal, paint Ink, read raw keys, then
  return control. There's no `local: true` / `disable-assistant: true` frontmatter key.
- **Blocked**: "print to terminal only". Commands emit assistant-visible content. The model
  will react to whatever the command body produces unless `disable-model-invocation: true`
  + a noop body is used, and even then the command fires a turn.
- **Possible**: commands that shell out to claude-watch CLI via `allowed-tools: Bash(claude-watch *)`
  and return formatted output. That output becomes assistant context — fine for
  `/cw status`, awkward for interactive flows.
- **Possible**: claude-watch ships a `monitors/monitors.json` that runs a scan loop and
  delivers state as `<task_notification>` events ("orphan detected: session xyz"). This is
  genuinely novel — the assistant gets woken with context rather than the user having to ask.
- **Unknown**: whether `/cw refresh` can trigger a graceful exit of the current claude
  session from inside it (the assistant can run `claude-watch respawn` via Bash, but killing
  its own parent pid is messy; the cleaner path is `process.exit` via a post-hook SystemMessage).

### 2. Integration points
- `commands/cw-status.md` with `allowed-tools: Bash(claude-watch status:*), disable-model-invocation: true`
  — user-only, assistant renders the status table in chat.
- `commands/cw-pin.md` — runs `claude-watch activate --session $CLAUDE_SESSION_ID` via Bash.
- `commands/cw-respawn.md` — runs `claude-watch respawn` async, the scan loop handles the kill+relaunch.
- `monitors/monitors.json` — `command: "claude-watch _monitor --tail"` emitting one JSON line
  per scan: assistant sees it as a `<task_notification>`.
- `UserPromptSubmit` hook with `additionalContext: "[watched: yes, last-scan: 2m]"` — one
  line every turn, cheap, keeps assistant informed.

### 3. UX options
1. **Commands-only**. Ship `/cw-status`, `/cw-pin`, `/cw-unpin`, `/cw-respawn`. Every command
   is `disable-model-invocation: true` + bash shellout. Pro: simplest, no surprise side effects.
   Con: output always clutters the transcript.
2. **Silent monitor + one command**. Only ship `/cw` (help/status) plus `monitors/monitors.json`
   that pushes events when state changes. Pro: ambient awareness, zero ceremony. Con: turns the
   assistant into a watchdog narrator the user may not want.
3. **Status-line integration** (`statusline` manifest field is confirmed). Bottom bar shows
   `watched | last-scan 2m | orphans: 0`. Pro: zero prompt cost, glanceable. Con: can't take
   action from there — still need commands for pin/unpin/respawn.

### 4. Experiments
- Build the simplest `/cw-status` command that bash-calls `claude-watch status --json`, see
  how the output renders and whether the assistant over-narrates.
- Try `monitors/monitors.json` with a heartbeat every 60s — confirm `<task_notification>`
  delivery doesn't spam the model context.
- Test `disable-model-invocation: true`: does the user-typed `/cw-status` still trigger a
  full assistant turn, or does the harness short-circuit?
- Check whether `statusline` command output refreshes live or only per prompt.

### 5. Recommendation
**Option 3 (status-line) + Option 1 (commands) combined**. Status-line for ambient state,
dumb commands for actions. Skip monitors for v1 — `<task_notification>` events carry model
cost and the watchdog shouldn't interrupt the human's actual work. Revisit monitors once we
have a real "alert-worthy" signal (e.g. peer session crashed).

## Combined recommendation & ordering

1. **Ship Track A first, narrow**: plugin's `SessionStart` hook (adopt-on-resume) +
   `UserPromptSubmit.sessionTitle` (visible `[watched]` tag in native picker). Zero new UI,
   just makes the native `/resume` work correctly when users go around the wrapper.
2. **Then Track B status-line**: single glance-bar in-session, no commands yet.
3. **Then Track B commands**: `/cw-status`, `/cw-pin`, `/cw-respawn` after we've lived with
   the status-line and know which actions matter.
4. **Optional later**: `cw resume` shell wrapper for watched-first launching. Only worth it
   if users report the native picker alone feels incomplete.

## Open questions for the user

- Is the goal to **replace** the `claude --resume` entrypoint or just **augment** it? Shell
  wrapper vs. native-first changes everything downstream.
- Do you want the assistant to be aware that the session is watched (additionalContext on
  every prompt), or should claude-watch be invisible to the model? The former enables
  "the user said /cw-respawn — Claude knows to wrap up"; the latter keeps the context window
  cleaner.
- Is `monitors/monitors.json` interesting enough to prototype, or is the status-line plus
  silent hooks sufficient? Monitors are powerful but they inject the assistant into the loop.
- How do you feel about `[watched]` appearing in the session title? That makes the native
  `/resume` picker useful without a wrapper, but it mutates a user-visible field.
- Are you OK with slash-command output showing in the transcript, or do you want the
  commands to feel truly local (in which case Track B is blocked and we should petition
  Anthropic for a `local: true` frontmatter key)?
