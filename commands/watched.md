---
name: watched
description: Open the claude-watch picker in a tmux split pane
allowed-tools: [Bash]
---

The user wants to open the claude-watch picker.

Run via Bash:

```
claude-watch pick --split-pane
```

Then **echo the stdout of that command verbatim in your reply** — it tells the user exactly what happened (success message with the right key combo, or a precise error if they're not in tmux). Do not re-word, do not embellish, do not infer success unless the CLI's exit code was 0.
