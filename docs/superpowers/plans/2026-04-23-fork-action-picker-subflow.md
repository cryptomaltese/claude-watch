# Fork action — picker subflow

> **Supersedes:** `2026-04-20-optional-fork-session.md` (shipped then reverted 2026-04-22). That plan treated fork as a workflow toggle; this one treats it as a deliberate picker-level action with its own subflow, per the supersede note.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add `fork` and `fork + attach` actions to the picker's per-session ActionMenu. Forking clones a source session's transcript into a user-chosen target cwd without disturbing the source. The fork becomes its own watched session; the source stays watched and untouched.

**Empirical grounding (2026-04-23 test session):** Claude Code's `--resume <id> --fork-session` is cwd-scoped — it only finds a session if its jsonl lives under the invoking cwd's project dir (`~/.claude/projects/<slug(cwd)>/`). The cross-cwd fork recipe is: (a) copy the source jsonl into the target cwd's project dir as a breadcrumb, (b) invoke `claude --resume <src-id> --fork-session` from the target cwd, (c) delete the breadcrumb once the fork's own jsonl exists. The fork is self-contained — all parent history is inlined, so the breadcrumb is only needed for the resume lookup. Fork jsonl has a fresh sessionId and every entry's `cwd` field is the target cwd.

## Architecture

- Two new actions in `ActionMenu`, gated on `session.jsonlId` being set, mirroring the `refresh` / `refresh + attach` pattern. Not shown for brand-new sessions without a transcript.
- New `fork` screen in `App.tsx`, navigated to from ActionMenu. Uses a shared `CwdPrompt` component — `NewSessionInput`'s UI (path input + primary/secondary action buttons + state machine) is extracted into `CwdPrompt`, eliminating the duplication that would otherwise appear.
- New `fork()` function in `src/core/actions.ts`. Does preflight refusals, the copy-and-spawn mechanic, breadcrumb cleanup, and watched-state upsert. Same RC-await / sentinel pattern as `createNew` / `refresh`.

## Preflight refusals

`fork()` throws (surfaced as red text in the subflow screen, like existing action errors) if any of:

- **Target cwd already has a watched entry.** Refuse: `"already watched — deactivate first"`. Matches "rare deliberate action" framing — silent re-pin would mask user error.
- **Target cwd has a live tmux session** (per `findTmuxForCwd`). Refuse: `"active session in target cwd — refresh or deactivate first"`.
- **Source jsonl mtime < 2000ms ago.** Refuse: `"source has an active turn — wait a moment and retry"`. Defends against torn-read during a mid-write; cheap alternative to process/pane inspection.

## Tech Stack

TypeScript, Ink, bun:test, ink-testing-library. Existing `src/core/{actions,state,slug,tmux,config}.ts`, `src/picker/*`. No new dependencies.

---

## File Structure

**Modified:**
- `src/picker/NewSessionInput.tsx` — refactored to use `CwdPrompt`.
- `src/picker/ActionMenu.tsx` — adds fork actions (gated on `jsonlId`), new `onFork` prop.
- `src/picker/App.tsx` — adds `"fork"` screen route with source-session context.
- `src/core/actions.ts` — adds `fork()` and (optional helper) a `preflight()` used by fork.
- `tests/core/actions.test.ts` — new tests for fork happy path + each refusal case.
- `tests/picker/ActionMenu.test.tsx` — verify fork actions appear iff `jsonlId` is set.
- `tests/picker/NewSessionInput.test.tsx` — existing tests continue to pass after CwdPrompt extraction.
- `README.md` — adds Fork to the documented action list.

**New:**
- `src/picker/CwdPrompt.tsx` — shared cwd-input component. Props: `{ title: string; hint?: string; primaryLabel: string; secondaryLabel: string; onSubmit(cwd: string, attach: boolean): Promise<void>; onBack(): void; }`. Owns the input field, path resolution, primary/secondary toggle, and the `input → working → rc → done` state machine.
- `src/picker/ForkSessionInput.tsx` — thin wrapper around `CwdPrompt` that constructs the fork callbacks from the source session prop.
- `tests/picker/CwdPrompt.test.tsx` — isolated tests for the extracted component.
- `tests/picker/ForkSessionInput.test.tsx` — wrapper smoke test.

---

## Task 1: Extract `CwdPrompt` from `NewSessionInput`

Pure refactor — no new behavior. Establishes the shared component so Task 3 can reuse it.

- [ ] **Step 1: Write failing tests for `CwdPrompt`.** In `tests/picker/CwdPrompt.test.tsx`, assert: (a) renders `title` prop in header; (b) typed characters appear in the path field; (c) up/down toggles primary/secondary selection; (d) Enter calls `onSubmit(resolvedPath, attach)` with `attach=false` when primary is selected, `true` for secondary; (e) Esc calls `onBack`. Mirror the structure of the existing `tests/picker/NewSessionInput.test.tsx`.

- [ ] **Step 2: Run tests — expect failures** (`CwdPrompt` doesn't exist yet).

- [ ] **Step 3: Create `src/picker/CwdPrompt.tsx`.** Lift the full render + input-handling + state-machine logic from `NewSessionInput.tsx`. Make behaviour parametric on the new props listed in File Structure. Keep the `resolvePath` helper (currently inline in NewSessionInput); export it from `CwdPrompt.tsx` if useful, otherwise keep it module-private.

- [ ] **Step 4: Rewrite `src/picker/NewSessionInput.tsx` as a thin wrapper.** Replace its body with a single `<CwdPrompt>` call wiring: title `"new watched session"`, primaryLabel `"create + activate"`, secondaryLabel `"create + activate + attach"`, hint `"Directory will be created if it doesn't exist."`, `onSubmit` calling `createNew({ cwd, attach, remoteControl: true })`, `onBack` passed through.

- [ ] **Step 5: Run `bun test tests/picker/`.** All CwdPrompt tests pass + all pre-existing NewSessionInput tests still pass. No behaviour change on the new-session flow.

- [ ] **Step 6: Run `bun run lint`** — clean.

- [ ] **Step 7: Commit.**
  ```bash
  git add src/picker/CwdPrompt.tsx src/picker/NewSessionInput.tsx tests/picker/CwdPrompt.test.tsx
  git commit -m "refactor(picker): extract CwdPrompt from NewSessionInput"
  ```

---

## Task 2: Core `fork()` with preflight

Add the function that does the actual work. Tests drive every path.

- [ ] **Step 1: Write failing happy-path test.** In `tests/core/actions.test.ts`, add a test that:
  - Creates a source jsonl under a fake project dir (use the existing `f.setEnv()` fixture + `writeFileSync`).
  - Touches the source jsonl with mtime well in the past (`utimesSync` 10s ago) to avoid the active-turn gate.
  - Calls `fork({ cwd: targetCwd, srcJsonlPath, srcJsonlId, attach: false, remoteControl: false })`.
  - Asserts: (a) target project dir exists and contains a jsonl whose id ≠ srcJsonlId (the breadcrumb will be short-lived so don't assert on it post-run); (b) tmux driver received a `newSession(name, targetCwd, cmd)` call where `cmd` contains `--resume <srcJsonlId>` and `--fork-session`; (c) watched state contains `targetCwd`. Use the fake tmux driver pattern already in `tests/core/actions.test.ts`.

- [ ] **Step 2: Run test — expect failure** (`fork` is not exported).

- [ ] **Step 3: Implement `fork()` in `src/core/actions.ts`.** Signature:
  ```ts
  interface ForkOpts {
    cwd: string;            // target cwd
    srcJsonlPath: string;   // absolute path to source jsonl
    srcJsonlId: string;     // UUID
    attach?: boolean;
    remoteControl?: boolean;
  }
  export async function fork(opts: ForkOpts): Promise<void>
  ```
  Flow:
  1. `validateCwd(cwd)`, `validateJsonlId(srcJsonlId)`, assert `existsSync(srcJsonlPath)`.
  2. **Active-turn refusal:** `statSync(srcJsonlPath).mtimeMs` — if `Date.now() - mtimeMs < 2000`, throw `Error("source has an active turn — wait a moment and retry")`.
  3. **Watched-target refusal:** load state under lock; if any entry matches `cwd`, throw `Error("already watched — deactivate first")`.
  4. **Live-session refusal:** `findTmuxForCwd(driver, cwd)` — if non-null, throw `Error("active session in target cwd — refresh or deactivate first")`.
  5. `mkdirSync(cwd, { recursive: true })`.
  6. Derive `targetProjectDir = join(getProjectsDir(), pathToSlug(cwd))` and `mkdirSync(targetProjectDir, { recursive: true })`.
  7. `cpSync(srcJsonlPath, join(targetProjectDir, \`${srcJsonlId}.jsonl\`))` — the breadcrumb.
  8. Upsert watched entry for `cwd` with `pinnedJsonl: null` (the fork's new jsonl id is unknown at spawn time — a later scan or picker load will surface it; `createNew`'s null-pinned pattern is the precedent).
  9. `tmuxName = cwdToTmuxName(cwd); driver.newSession(tmuxName, cwd, buildForkCmd(srcJsonlId));` where `buildForkCmd` is a local helper returning `"claude --permission-mode auto --resume <id> --fork-session"` (or reuses config like `buildClaudeCmd` — decide during implementation; simplest is to extend `buildClaudeCmd(jsonlId, { fork: true })`).
  10. **Breadcrumb cleanup (best-effort):** poll `targetProjectDir` for any `.jsonl` whose basename ≠ `srcJsonlId`, for up to 30s at 500ms intervals. On appearance, `unlinkSync` the breadcrumb. On timeout, `log("warn", ...)` and leave the breadcrumb — the fork still works; user can clean up manually.
  11. `if (enableRC && !attach) await activateRemoteControl(tmuxName);`
  12. `if (attach) writeSentinel(tmuxName);`

  Extend `buildClaudeCmd`:
  ```ts
  export function buildClaudeCmd(jsonlId: string | null, opts?: { fork?: boolean }): string { ... if (opts?.fork) cmd += " --fork-session"; ... }
  ```
  Existing callers pass no `opts`, so behavior is unchanged.

- [ ] **Step 4: Run happy-path test — expect pass.**

- [ ] **Step 5: Write refusal-case tests.** Three tests, one per refusal:
  - Source mtime within 2s → `await expect(fork(...)).rejects.toThrow(/active turn/)`. Tmux driver received no `newSession` call.
  - Target cwd already in watched state → rejects with `/already watched/`.
  - Target cwd has live tmux (pre-seed driver's `hasSession` to return true for target's canonical name) → rejects with `/active session in target cwd/`.
  - For all three: watched state unchanged, no tmux session created, breadcrumb not created.

- [ ] **Step 6: Run all `tests/core/actions.test.ts` — every test passes.**

- [ ] **Step 7: Run full suite `bun test` — no regressions.**

- [ ] **Step 8: Run `bun run lint` — clean.**

- [ ] **Step 9: Commit.**
  ```bash
  git add src/core/actions.ts tests/core/actions.test.ts
  git commit -m "feat(actions): add fork with preflight guards"
  ```

---

## Task 3: Wire fork into the picker

Surface the new action in the ActionMenu and route through to a fork subflow screen.

- [ ] **Step 1: Write failing tests for ActionMenu.**
  - When `session.jsonlId` is a valid UUID: `fork` and `fork + attach` appear after `refresh` / `refresh + attach` in the menu.
  - When `session.jsonlId` is null (brand-new from `createNew`): neither fork action appears.
  - Selecting a fork action calls a new `onFork(session, { attach })` prop passed to ActionMenu (not the action-runner that handles primary/refresh). The parent (App.tsx) is responsible for routing; ActionMenu just reports the intent.

- [ ] **Step 2: Run tests — expect failure.**

- [ ] **Step 3: Update `ActionMenu.tsx`.**
  - Add `onFork: (session: Session, opts: { attach: boolean }) => void` to `Props`.
  - Extend the `ActionKind` union with `"fork"`.
  - After the refresh actions, conditionally append fork actions when `Boolean(session.jsonlId)` is true.
  - In `runAction`, if `action.kind === "fork"`, do NOT call any core action — instead call `onFork(session, { attach: action.attach })` and return. The fork screen owns the working/done state.

- [ ] **Step 4: Run ActionMenu tests — expect pass.**

- [ ] **Step 5: Create `src/picker/ForkSessionInput.tsx`.** Thin wrapper: takes `{ session: Session; attach: boolean; onBack: () => void }`, renders `<CwdPrompt title="fork session" hint="Fork into a new directory. Source stays untouched." primaryLabel="fork" secondaryLabel="fork + attach" onSubmit={...} onBack={onBack} />`. `onSubmit(cwd, submittedAttach)` calls `fork({ cwd, srcJsonlPath: session.jsonlPath, srcJsonlId: session.jsonlId!, attach: submittedAttach, remoteControl: true })`. (The `attach` prop hint is informational — users can still toggle on the destination screen; or simplify by auto-selecting the incoming `attach` as the default button. Decide during implementation; starting with pre-selected default matches the supersede note's "choose attach target" item.)

- [ ] **Step 6: Write a smoke test** `tests/picker/ForkSessionInput.test.tsx` — renders, accepts a path, submit calls `fork` with expected args (stub `fork` via import mock or by checking tmux driver calls end-to-end like existing tests).

- [ ] **Step 7: Update `App.tsx`.**
  - Extend the `screen` state union with `"fork"`.
  - Track fork source session + pre-selected attach mode: `const [forkCtx, setForkCtx] = useState<{ session: Session; attach: boolean } | null>(null)`.
  - Pass `onFork={(session, { attach }) => { setForkCtx({ session, attach }); setScreen("fork"); }}` to ActionMenu.
  - Render `<ForkSessionInput session={forkCtx.session} attach={forkCtx.attach} onBack={() => { setForkCtx(null); setScreen("list"); }} />` when `screen === "fork"` and `forkCtx` is set.

- [ ] **Step 8: Run the full suite — expect pass.**

- [ ] **Step 9: Run `bun run lint` — clean.**

- [ ] **Step 10: Run `bun run build` — dist regenerates.**

- [ ] **Step 11: Manual smoke.**
  - Launch `claude-watch pick`.
  - Pick any alive watched session, enter the action menu — confirm `fork` and `fork + attach` show below `refresh` actions.
  - Pick `fork`, enter a new absolute path like `/tmp/cw-fork-manual`, submit.
  - Expect: fork screen transitions to RC-wait, then back to picker. The picker should show the original session AND a new entry at `/tmp/cw-fork-manual` marked watched + live.
  - Inspect `~/.claude/projects/-tmp-cw-fork-manual/` — should contain exactly one `.jsonl` (the fork; breadcrumb was cleaned up). The source project dir is untouched — same jsonl count as before.
  - Repeat with `fork + attach` — verify the terminal attaches to the new tmux.
  - Cleanup: `claude-watch deactivate /tmp/cw-fork-manual && rm -rf /tmp/cw-fork-manual ~/.claude/projects/-tmp-cw-fork-manual`.

- [ ] **Step 12: Commit.**
  ```bash
  git add src/picker/ActionMenu.tsx src/picker/App.tsx src/picker/ForkSessionInput.tsx tests/picker/ActionMenu.test.tsx tests/picker/ForkSessionInput.test.tsx dist/cli.js
  git commit -m "feat(picker): add Fork subflow"
  ```

---

## Task 4: Docs + final verification

- [ ] **Step 1: Update `README.md`.** In the action list (search for the block that mentions `refresh`, `deactivate`), add:
  > **`fork` / `fork + attach`** — clone the selected session into a new cwd, leaving the source untouched. Both the source and the fork stay watched. Preflight refuses if the target cwd is already watched, has a running tmux session, or if the source has an active turn in flight.

- [ ] **Step 2: Run `bun test`, `bun run lint`, `bun run build`** — all clean.

- [ ] **Step 3: Bundle freshness gate simulation** (matches the CI check):
  ```bash
  cp dist/cli.js /tmp/committed.js
  bun run build
  STAMP_RE='"[0-9]{8}T[0-9]{6}Z-[0-9a-f]{7,}"'
  diff <(sed -E "s/$STAMP_RE/\"STAMP\"/g" /tmp/committed.js) \
       <(sed -E "s/$STAMP_RE/\"STAMP\"/g" dist/cli.js)
  ```
  Expect zero diff.

- [ ] **Step 4: Commit.**
  ```bash
  git add README.md dist/cli.js
  git commit -m "docs: document Fork action"
  ```

- [ ] **Step 5: Confirm the branch diff is cohesive.**
  ```bash
  git log --oneline main..HEAD
  ```
  Expect four focused commits in order:
  ```
  <sha> docs: document Fork action
  <sha> feat(picker): add Fork subflow
  <sha> feat(actions): add fork with preflight guards
  <sha> refactor(picker): extract CwdPrompt from NewSessionInput
  ```
