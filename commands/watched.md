---
name: watched
description: Manage claude-watch sessions from inside Claude Code
argument-hint: "[-s <query>]"
allowed-tools: [Bash, AskUserQuestion]
---

The user wants to pick, act on, or switch focus to one of their claude-watch sessions — without leaving the current Claude Code conversation.

Arguments: $ARGUMENTS

## Flow

### 1. Fetch the session list

Run the following via Bash:

```
claude-watch status --json $ARGUMENTS
```

Parse the JSON. The shape is:

```
{ sessions: [{ cwd, jsonlId, name, slug, isWatched, isAlive, brandNew, mtime, lastEvent }, ...],
  page: { current, total },
  totalCount: <n> }
```

### 2. Print a numbered list

For each session on the current page, emit one formatted row (2 lines):

```
<N>. <name>  <state tags>
    <age> · <cwd>
    "<lastEvent, truncated to ~80 chars>"
```

Where `<state tags>` is:
- `live watched` — isAlive && isWatched
- `watched · dead` — isWatched && !isAlive
- `live` — isAlive && !isWatched
- (no tag) — neither
- Add `new` if `brandNew` is true (watched, no jsonl yet)

Then tell the user: `type a number, or "more" for the next page` if `page.total > 1`. Otherwise just `type a number`.

### 3. Wait for the user's selection

The user will reply with a number, or the word "more", or natural-language like "the trading one". Resolve accordingly:
- Number → the n-th session on the current page (1-indexed).
- "more" → call `claude-watch status --json --page <current+1> $ARGUMENTS` and repeat step 2.
- Name-match → best-effort substring match on name or lastEvent, fall back to asking "did you mean: A / B / C?" via AskUserQuestion if ambiguous.

### 4. Ask which action to take (via AskUserQuestion)

Options depend on the selected session's state. Offer exactly:

| State | Options |
|---|---|
| Unwatched + alive | activate, fork, attach |
| Unwatched + dead | activate, fork |
| Watched + alive w/ jsonl | deactivate, refresh, fork, attach |
| Watched + dead w/ jsonl | deactivate, refresh, fork, attach |
| Watched + brand-new alive | deactivate, refresh, attach |
| Watched + brand-new dead | deactivate, refresh, attach |

"attach" is safe on watched+dead: the `claude-watch attach` subcommand auto-resuscitates before switching.

### 5. Collect extra input

- If action == `fork`: ask the user conversationally for the target cwd (absolute path, or relative to CWD). Accept free-text.

### 6. Ask the attach disposition (only for non-attach actions)

If action is not `attach`, use AskUserQuestion:
- "stay here" — run the action, report result, stay in this Claude
- "continue in selected" — run the action, then `tmux switch-client` to the selected session's pane

### 7. Execute

Via Bash, call the matching subcommand:

- `attach`: `claude-watch attach <cwd>`
- `activate`: `claude-watch activate <cwd> [--jsonl <id>]` (`--jsonl` optional, defaults to newest jsonl at that cwd)
- `deactivate`: `claude-watch deactivate <cwd>`
- `refresh`: `claude-watch refresh <cwd>` (works for brand-new sessions too — spawns without `--resume` when pinnedJsonl is null)
- `fork`: `claude-watch fork <src-cwd> <target-cwd>` (resolves the source jsonl automatically from watched.json / newest-on-disk)

If the disposition was `continue in selected`, after the action succeeds also run:

```
tmux switch-client -t <tmux-name>
```

Where `<tmux-name>` is `claude-<slug>` (derived from the target cwd — the CLI logs this name on success, parse it from the output).

### 8. Report the outcome

One terse sentence. Examples:
- `✓ refreshed trading session`
- `✓ forked trading → hummingbot-infra, switching focus`
- `✓ attached to nautilus pane`

## Notes

- This command is a thin adapter over the `claude-watch` CLI. All actions are identical to the same actions run from the interactive `claude-watch pick` picker — same state files, same tmux sessions, same jsonls.
- If `tmux switch-client` fails (e.g., current process isn't inside tmux), fall back to printing `tmux attach -t <name>` and let the user run it.
