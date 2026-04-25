---
name: watched
description: Open the claude-watch picker in a tmux split pane
allowed-tools: [Bash]
---

The user wants to manage their claude-watch sessions. The picker is the canonical UI for this — open it in a sibling tmux pane so it can use the full keyboard without fighting Claude Code's chat UI.

Run via Bash:

```
tmux split-window -h 'claude-watch pick'
```

Then reply with one short line so the user knows what happened and where focus is needed:

> ✓ Picker opened in a new pane. Switch focus with your tmux prefix + `o` (or arrow keys).

If the Bash call fails because the user isn't inside tmux (`tmux: no server running` or `error: not inside tmux`), report that directly — claude-watch's picker requires a tmux host, and it can't open a sibling pane without one. Suggest `claude-watch pick` from a regular terminal as the alternative.
