---
name: watched
description: Manage claude-watch sessions from inside Claude Code
argument-hint: "[-s <query>]"
allowed-tools: [Bash, AskUserQuestion]
---

The user wants to pick, act on, or switch focus to one of their claude-watch sessions.

Arguments: $ARGUMENTS

## Step 1 — show the list

Run exactly this via Bash (no `jq`, no piping, no transformation — the CLI already emits ready-to-display text):

```
claude-watch status --list $ARGUMENTS
```

Print the output **verbatim**. Do not reformat it. Do not re-render it. The user wants what the CLI prints.

## Step 2 — wait for a number

The user's reply will be:
- a number N → the N-th session in the list just shown
- the word `more` → call `claude-watch status --list --page <N+1> $ARGUMENTS` and repeat step 1
- natural language like "the trading one" → match on name; if ambiguous, ask which one via AskUserQuestion

Each list row's first line has this shape:
`<N>. [<state>] <name>[ (this session)][ · jsonl:<prefix>]`

Parse `<state>` to derive the session's action matrix for step 3. `<N>` is the number the user will type.

## Step 3 — pick the action (AskUserQuestion)

Based on the selected session's `<state>`, offer exactly these options:

| state | options |
|---|---|
| unwatched alive | activate, fork, attach |
| unwatched dead | activate, fork |
| watched alive | deactivate, refresh, fork, attach |
| watched dead | deactivate, refresh, fork, attach |
| new alive | deactivate, refresh, attach |
| new dead | deactivate, refresh, attach |

`attach` is always safe — the CLI auto-resuscitates dead watched sessions before switching.

## Step 4 — collect extras

- `fork` → ask the user conversationally for the target cwd (absolute or relative path).

## Step 5 — pick the disposition (AskUserQuestion, non-attach actions only)

- `stay here` → run the action, report the result, stay in this Claude.
- `continue in selected` → run the action, then `tmux switch-client -t <tmux-name>` to the selected session's pane.

## Step 6 — execute

Via Bash, one call:

- `attach` → `claude-watch attach <cwd>`
- `activate` → `claude-watch activate <cwd>`
- `deactivate` → `claude-watch deactivate <cwd>`
- `refresh` → `claude-watch refresh <cwd>`
- `fork` → `claude-watch fork <src-cwd> <target-cwd>`

Each of these prints the tmux name on success (`as claude-<slug>`). Parse it if you need to follow up with a switch-client.

For the `continue in selected` disposition, run the action above and then:

```
tmux switch-client -t <tmux-name>
```

## Step 7 — one-line result

Examples:
- `✓ refreshed trading`
- `✓ forked trading → hummingbot-infra, switching focus`
- `✓ attached to nautilus pane`

## Principles

- One Bash call per step. No jq, no pipes, no reformatting. The CLI does the work.
- Never print the raw JSON envelope. `--list` is what the user sees.
- If the user picks a dead unwatched session and the action menu doesn't match what they asked for, explain the state and tell them to activate first.
