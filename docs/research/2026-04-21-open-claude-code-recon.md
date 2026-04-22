# open-claude-code recon

**Repo:** https://github.com/ruvnet/open-claude-code (200 stars, active April 2026)
**Date:** 2026-04-21

## 1. What it is

Clean-room reimplementation of Claude Code CLI (`occ` binary), informed by ruDevolution's AI-assisted decompilation of Anthropic's published npm package. Two trees: `v2/` is the live rewrite (~8k LOC, Ink + React); `archive/open_claude_code/` holds the 7.6 MB minified decompile of Claude's actual `cli.mjs` plus early hand-written prototypes (readline + WASM/Yoga experiments). Not a fork, not a proxy — a parallel build.

## 2. Does it have a session picker?

**No.** `v2` has a `SessionManager` that save/resumes a single `session.json` per project (not jsonl, not multi-session), and no `/resume` command handler is registered in `commands.mjs` despite the top-level README advertising `/resume [id]`. The archive's terminal-renderer doc mentions a "Selection Menu" component in an ASCII diagram but no implementation exists. **Zero interactive picker code to mine.** The minified `cli.mjs` in `archive/` is the real Claude Code binary, but it's dead weight for styling cues — you already have the screenshots.

## 3. Visual/UX patterns worth borrowing

- **Status bar separator glyph + segment pattern** (`v2/src/ui/components.mjs` `StatusBar`): left-block `▊` + cyan bold brand, then ` │ ` (U+2502 gray) separators between segments. Clean, dense, reads at a glance — a good footer template for our picker's "N sessions • filter: X • enter: resume" line.
- **Context-pressure color ramp**: green <50%, yellow 50-80%, red >80% with a `●` dot prefix. Direct steal for our "token usage" or "age" column on each row.
- **Spinner frame set**: `['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏']` at 80ms in cyan, dim label. Matches what users expect from Claude Code. Use during "loading session preview" states.
- **Border conventions**: `borderStyle: 'round'` + yellow for interactive prompts (PermissionPrompt pattern), `borderStyle: 'single'` + gray for passive content (CodeBlock). Apply round-yellow to our rename/delete confirmation modal, single-gray to preview pane.
- **Keyboard: Esc cancels in-flight op, Ctrl+C exits, Ctrl+L clears** (`v2/src/ui/app.mjs` `useInput`). Match exactly — these are muscle memory. Add: our picker-specific keys (j/k, /, enter, d) on top of, not replacing, these.
- **Welcome banner minimalism**: 3 lines (name bold, dim "model | tools", dim hint). No ASCII art, no boxes. Good template for our empty state when no sessions exist.

## 4. Not worth borrowing / N/A

- **Session storage format** is incompatible: single `session.json` per SHA16(projectDir), not `~/.claude/projects/<slug>/*.jsonl`. No parsing helpers for the real format. Stick with your own jsonl reader.
- **WASM/Yoga layout engine** (archive-only prototype): overkill for a picker. Ink's flexbox is enough.

## 5. Verdict

**Borrow the visual primitives (StatusBar separators, context color ramp, spinner, border conventions) — skip everything session-related.** Check back after they ship an actual `/resume` picker; today there's nothing to parity-match against.

Source files worth bookmarking:
- `v2/src/ui/components.mjs` — all Ink primitives
- `v2/src/ui/app.mjs` — input handling + message list patterns
- `v2/package.json` — dep pinning (`ink ^5.2.1`, `ink-text-input ^6.0.0`, `ink-spinner ^5.0.0`, `react ^18.3.1`)
