# Research: install-guide SKILL

**Purpose**: design a claude-watch SKILL that an agent invokes to walk a user through installation — reading their current state, comparing against claude-watch defaults, explaining each knob, and applying approved changes. The stated side-effect goal: force us to articulate our footprint and sensible defaults.

## How skills work in Claude Code plugins

- Skills live at `<plugin-root>/skills/<skill-name>/SKILL.md`
- YAML frontmatter: `name` + `description`
- Agent decides when to invoke based on `description` — this is the trigger surface
- Skills are **reference guides**, not narratives. They document *proven techniques* an agent should follow
- A plugin can ship multiple skills; they're siblings under `skills/`

## What claude-watch currently ships

Single skill at `skills/claude-watch/SKILL.md` (40 lines). Problems:

- Still recommends `bypassPermissions` — stale since our 2026-04-17 autopsy. Should be `auto`.
- Describes quick commands (`claude-watch status`, `scan`, etc.) but no install flow.
- Says nothing about `~/.claude/settings.json` keys (`enableAutoMode`, `defaultMode`).
- Troubleshooting section covers tmux/ripgrep/cron install but not config mismatches.
- No mention of claude-watch's own config at `~/.claude-watch/config.json`.

The existing skill needs an update regardless; an install-guide is additive.

## Proposed structure

Two skills, kept distinct:

- `claude-watch` (existing, updated) — reference guide for daily operation (picker, commands, troubleshooting)
- `claude-watch-install` (new) — configuration walkthrough, triggered on install-adjacent conversations

### `claude-watch-install` frontmatter draft

```yaml
---
name: claude-watch-install
description: Use when the user is installing claude-watch for the first time, reviewing their claude-watch config, or diagnosing a freshly-installed claude-watch that isn't behaving correctly. Walks through required global Claude settings and claude-watch's own config, explaining each knob and applying changes only with user consent.
---
```

### Phases the skill should walk through

1. **Detect install state.** Does `~/.claude-watch/bin/claude-watch` exist? Is `crontab -l` showing the scan entry? Is the symlink at `~/.local/bin/claude-watch` pointing where we expect?

2. **Compare global claude settings.** Read `~/.claude/settings.json`. For each key below, show current value vs expected, explain, ask:

   | Key | Expected | Why |
   |---|---|---|
   | `enableAutoMode` | `true` | Unlocks auto permission mode in settings; without it Desktop greys out "Auto mode" |
   | `permissions.defaultMode` | `"auto"` | Claude-watched sessions spawn with `--permission-mode auto`; matching global eliminates inconsistency across non-watched sessions |
   | `skipAutoPermissionPrompt` | `true` | Silences first-run dialog when a session enters auto mode; otherwise every respawn shows consent UI |
   | `remoteControl` | `true` | Claude's default; required if user wants Desktop/mobile visibility |

3. **Compare claude-watch config.** Read `~/.claude-watch/config.json` (may not exist — defaults apply). Show each key with its default and what it affects:

   | Key | Default | Impact |
   |---|---|---|
   | `permissionMode` | `"auto"` | CLI flag on every spawn |
   | `dangerouslySkipPermissions` | `false` | If `true`, adds `--dangerously-skip-permissions`; rarely useful since auto mode covers the cases |
   | `forkOnResume` | `false` *(pending plan)* | If `true`, `--fork-session` is appended — creates new jsonl per resume, loses Desktop conversation title |
   | `remoteControl` | `true` | Send `/remote-control` after spawn so Desktop sees the session |
   | `resume` | `true` | Use the pinned jsonl on resume (vs always fresh) |
   | `peekLines` | `7` | Picker peek panel line count |
   | `pageSize` | `10` | Sessions per picker page |

4. **Check for conflicting local overrides.** For each cwd the user cares about, check `<cwd>/.claude/settings.local.json`. Do NOT warn on empty allow lists (that's the debunked 2026-04-17 myth). Warn only on `defaultMode` overrides that conflict with the chosen global mode.

5. **Apply approved changes.** Only after explicit user confirmation on each delta. Use Edit tool on specific keys, not Write — preserves comments and other keys.

6. **Smoke test.** After alignment:
   - `claude-watch status` returns cleanly
   - `claude-watch` opens the picker without errors
   - If user wants, create a disposable watched session and verify Desktop sees it

## Footprint questions this research surfaces

Writing the skill forces us to articulate answers. Currently each is somewhere between "implicit" and "handled inconsistently":

1. **Is `enableAutoMode: true` required or recommended?**
   Practically required for Desktop users (native memory-dir prompts). Optional for terminal-only. **Recommendation: the SKILL should ask "do you use the Desktop/mobile/web app?" and branch — if yes, required; if no, optional.**

2. **`auto` vs `bypassPermissions` as defaultMode?**
   We currently recommend `auto`. Both work for terminal. For Desktop, only `auto` solves the memory-prompt issue. **Recommendation: `auto` everywhere. Deprecate `bypassPermissions` recommendation from old docs.**

3. **Is `remoteControl: true` appropriate as a default?**
   If user never opens Desktop, RC activation is pure overhead (~25-40s on every brand-new spawn). **Recommendation: default stays `true` (don't want to surprise Desktop users) but the install SKILL should ask and offer to set it `false` for terminal-only users.**

4. **`peekLines: 7` and `pageSize: 10` — arbitrary?**
   Yes. We could derive them from `stdout.rows` at runtime, but that runs in a daemon context at scan time where stdout is a file. **Leave as static defaults; SKILL can suggest tuning for very tall / very short terminals.**

5. **Cron 5-min interval — right default?**
   Our original intuition. If the user kills claude manually and scan resurrects it 5 min later, that's annoying. If it resurrects 30 sec later, it might race with user actions. **Leave at 5 min; the SKILL can offer "tighter" (every 2 min) or "looser" (every 15 min) as scenarios.**

6. **Missing cron / alternative schedulers?**
   Currently we use system cron. On systemd-only systems, we'd need to ship a user-mode systemd timer. **Out of scope for this SKILL. File as follow-up.**

7. **`dangerouslySkipPermissions` — why ship the flag?**
   User asked to keep it configurable "in case some users need it." But after auto mode landed, the legitimate use cases shrank to "claude-watch session for a fully-sandboxed sandboxed agent with no internet." **The SKILL should explain this narrow use case and default to keeping it `false`.**

8. **`forkOnResume` — which way should default go?**
   Plan says default `false` (preserve continuity). Agreed. The SKILL should explain the tradeoff: "default is off so your Desktop sees the same conversation across respawns. Flip to `true` if you manually invoke `claude --resume` on a watched cwd outside claude-watch (rare)."

9. **Local `.claude/settings.local.json` `defaultMode` conflicts**
   If a cwd's local settings sets `defaultMode: "bypassPermissions"` while global is `auto`, the per-cwd takes precedence. We want install users to know this exists as a gotcha. **SKILL should scan frequently-used cwds (from watched.json if present) for conflicts.**

10. **Two-way editing: SKILL offers to modify user's `~/.claude/settings.json`**
    This is itself a permission-sensitive action. Claude Code's own auto-mode rules flag `Self-Modification` as a block. We'd need the user's explicit consent on every change. **SKILL must be written such that the agent presents a diff and asks, rather than applying blindly.**

## Open questions for the user

- Should the install SKILL be a SEPARATE skill (`claude-watch-install`), or fold into the existing `claude-watch` SKILL as a sub-section? Separate is cleaner IMO; existing skill is daily-ops reference.
- Do we also want to update the existing `claude-watch` SKILL (fix stale `bypassPermissions` note, add peek/refresh/new action docs) as part of the same effort? Worth a single "skills overhaul" task.
- For the config-compare phase: do we want the SKILL to write-back changes directly, or produce a shell script the user runs themselves? Write-back is friendlier but requires permission confirmations; shell script is more transparent but more friction.

## Recommended next step

Dispatch an agent (using `superpowers:writing-skills` + `superpowers:writing-plans`) to:

1. **First**: write a baseline test — give a subagent the install scenario cold, see how it botches the config comparison. Document the failure modes.
2. **Then**: write `skills/claude-watch-install/SKILL.md` per the structure above.
3. **Alongside**: update `skills/claude-watch/SKILL.md` to fix the stale `bypassPermissions` recommendation and cross-reference the new install skill.

The footprint questions above are the raw material for a "sensible defaults" review session with the human. They should be discussed before writing the skill, not after — the SKILL codifies our answers.
