import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { activate, deactivate, createNew, refresh, fork } from "../../src/core/actions";
import { loadState } from "../../src/core/state";
import { setTmuxDriver, MockTmuxDriver } from "../../src/core/tmux";
import { makeFixture, makeUserEvent, type Fixture } from "../helpers/fixture";
import { readFileSync, existsSync, utimesSync } from "node:fs";
import { join } from "node:path";

// Use valid UUIDs in tests (UUID v4 format required by validateJsonlId)
const JSONL_ID = "abc12345-1234-1234-1234-abc123456789";

describe("actions", () => {
  let f: Fixture;
  let mockTmux: MockTmuxDriver;

  beforeEach(() => {
    f = makeFixture();
    f.setEnv();
    mockTmux = new MockTmuxDriver();
    setTmuxDriver(mockTmux);
  });

  afterEach(() => {
    f.restoreEnv();
    f.cleanup();
    setTmuxDriver(null!);
  });

  test("activate adds entry to watched.json", async () => {
    f.addSession("/home/user/proj", JSONL_ID, [makeUserEvent("hi")]);
    const cwd = `${f.root}/home/user/proj`;
    await activate({ cwd, jsonlId: JSONL_ID, remoteControl: false });
    const state = loadState();
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0].cwd).toBe(cwd);
    expect(state.entries[0].pinnedJsonl).toBe(JSONL_ID);
  });

  test("activate starts tmux session", async () => {
    f.addSession("/home/user/proj", JSONL_ID, [makeUserEvent("hi")]);
    const cwd = `${f.root}/home/user/proj`;
    await activate({ cwd, jsonlId: JSONL_ID, remoteControl: false });
    // The tmux name derives from the cwd path
    const sessions = Array.from(mockTmux.sessions.keys());
    expect(sessions.length).toBe(1);
    const session = mockTmux.sessions.get(sessions[0])!;
    expect(session.cmd).toContain(`--resume ${JSONL_ID}`);
  });

  test("buildClaudeCmd never appends --fork-session", async () => {
    const { buildClaudeCmd } = await import("../../src/core/actions");
    const cmd = buildClaudeCmd(JSONL_ID);
    expect(cmd).toContain(`--resume ${JSONL_ID}`);
    expect(cmd).not.toContain("--fork-session");
  });

  test("buildClaudeCmd omits --resume when no jsonlId (fresh session)", async () => {
    const { buildClaudeCmd } = await import("../../src/core/actions");
    const cmd = buildClaudeCmd(null);
    expect(cmd).not.toContain("--resume");
    expect(cmd).not.toContain("--fork-session");
  });

  test("activate writes sentinel when attach=true", async () => {
    const sentinelPath = `${f.root}/sentinel`;
    process.env.CLAUDE_WATCH_SENTINEL = sentinelPath;
    f.addSession("/home/user/proj", JSONL_ID, [makeUserEvent("hi")]);
    await activate({ cwd: `${f.root}/home/user/proj`, jsonlId: JSONL_ID, attach: true, remoteControl: false });
    expect(readFileSync(sentinelPath, "utf-8")).toContain("claude-");
    delete process.env.CLAUDE_WATCH_SENTINEL;
  });

  test("deactivate removes entry and kills tmux", async () => {
    const cwd = `${f.root}/home/user/proj`;
    f.addWatched([{ cwd, pinnedJsonl: "abc", pinnedAt: "2026-01-01T00:00:00Z" }]);
    // Need to find the tmux name for this cwd
    const { cwdToTmuxName } = await import("../../src/core/slug");
    const tmuxName = cwdToTmuxName(cwd);
    mockTmux.newSession(tmuxName, "/tmp", "echo");
    await deactivate({ cwd, kill: true });
    expect(loadState().entries).toHaveLength(0);
    expect(mockTmux.hasSession(tmuxName)).toBe(false);
  });

  test("deactivate with kill=false preserves tmux session", async () => {
    const cwd = `${f.root}/home/user/proj`;
    f.addWatched([{ cwd, pinnedJsonl: "abc", pinnedAt: "2026-01-01T00:00:00Z" }]);
    const { cwdToTmuxName } = await import("../../src/core/slug");
    const tmuxName = cwdToTmuxName(cwd);
    mockTmux.newSession(tmuxName, "/tmp", "echo");
    await deactivate({ cwd, kill: false });
    expect(loadState().entries).toHaveLength(0);
    expect(mockTmux.hasSession(tmuxName)).toBe(true);
  });

  test("createNew adds null-pinned entry and starts tmux", async () => {
    const cwd = `${f.root}/home/user/newproj`;
    await createNew({ cwd, remoteControl: false });
    const state = loadState();
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0].pinnedJsonl).toBeNull();
    const sessions = Array.from(mockTmux.sessions.keys());
    expect(sessions.length).toBe(1);
  });

  test("activate rejects invalid jsonl ID", async () => {
    const cwd = `${f.root}/home/user/proj`;
    await expect(
      activate({ cwd, jsonlId: "not-a-uuid", remoteControl: false })
    ).rejects.toThrow("invalid jsonl ID");
  });

  test("refresh kills existing tmux and respawns with --resume", async () => {
    f.addSession("/home/user/proj", JSONL_ID, [makeUserEvent("hi")]);
    const cwd = `${f.root}/home/user/proj`;
    const { cwdToTmuxName } = await import("../../src/core/slug");
    const tmuxName = cwdToTmuxName(cwd);
    mockTmux.newSession(tmuxName, cwd, "old claude");

    await refresh({ cwd, jsonlId: JSONL_ID, remoteControl: false });

    // Session should still exist but with a new command
    expect(mockTmux.hasSession(tmuxName)).toBe(true);
    const session = mockTmux.sessions.get(tmuxName)!;
    expect(session.cmd).not.toBe("old claude");
    expect(session.cmd).toContain(`--resume ${JSONL_ID}`);
  });

  test("refresh leaves watched.json untouched for watched sessions", async () => {
    f.addSession("/home/user/proj", JSONL_ID, [makeUserEvent("hi")]);
    const cwd = `${f.root}/home/user/proj`;
    f.addWatched([{ cwd, pinnedJsonl: JSONL_ID, pinnedAt: "2026-01-01T00:00:00Z" }]);

    await refresh({ cwd, jsonlId: JSONL_ID, remoteControl: false });

    const state = loadState();
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0].cwd).toBe(cwd);
  });

  test("refresh leaves watched.json untouched for unwatched sessions", async () => {
    f.addSession("/home/user/proj", JSONL_ID, [makeUserEvent("hi")]);
    const cwd = `${f.root}/home/user/proj`;

    await refresh({ cwd, jsonlId: JSONL_ID, remoteControl: false });

    const state = loadState();
    expect(state.entries).toHaveLength(0);
  });

  // ─── fork ──────────────────────────────────────────────────────────

  async function prepareSource(srcCwd: string): Promise<string> {
    const srcJsonlPath = f.addSession(srcCwd, JSONL_ID, [makeUserEvent("hi")]);
    // Age the jsonl so the active-turn guard doesn't fire
    const aged = (Date.now() - 10_000) / 1000;
    utimesSync(srcJsonlPath, aged, aged);
    return srcJsonlPath;
  }

  test("fork copies source jsonl as breadcrumb and spawns claude with --fork-session", async () => {
    const srcJsonlPath = await prepareSource("/home/user/src");
    const targetCwd = `${f.root}/home/user/tgt`;

    await fork({ cwd: targetCwd, srcJsonlPath, srcJsonlId: JSONL_ID, remoteControl: false });

    // Target project dir contains the breadcrumb copy of the source jsonl
    const { pathToSlug } = await import("../../src/core/slug");
    const targetProjectDir = join(f.projectsDir, pathToSlug(targetCwd));
    expect(existsSync(join(targetProjectDir, `${JSONL_ID}.jsonl`))).toBe(true);

    // Tmux spawn happened with --resume <id> --fork-session
    const sessions = Array.from(mockTmux.sessions.values());
    expect(sessions.length).toBe(1);
    expect(sessions[0].cmd).toContain(`--resume ${JSONL_ID}`);
    expect(sessions[0].cmd).toContain("--fork-session");
    expect(sessions[0].cwd).toBe(targetCwd);

    // Target cwd is now watched (pinnedJsonl null — fork's new id is unknown at spawn)
    const state = loadState();
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0].cwd).toBe(targetCwd);
    expect(state.entries[0].pinnedJsonl).toBeNull();
  });

  test("fork refuses when source jsonl has recent mtime (active turn)", async () => {
    const srcJsonlPath = f.addSession("/home/user/src", JSONL_ID, [makeUserEvent("hi")]);
    // fresh mtime — within the 2s guard
    const targetCwd = `${f.root}/home/user/tgt`;

    await expect(
      fork({ cwd: targetCwd, srcJsonlPath, srcJsonlId: JSONL_ID, remoteControl: false })
    ).rejects.toThrow(/active turn/);

    expect(mockTmux.sessions.size).toBe(0);
    expect(loadState().entries).toHaveLength(0);
  });

  test("fork refuses when target cwd is already watched", async () => {
    const srcJsonlPath = await prepareSource("/home/user/src");
    const targetCwd = `${f.root}/home/user/tgt`;
    f.addWatched([{ cwd: targetCwd, pinnedJsonl: "existing", pinnedAt: "2026-01-01T00:00:00Z" }]);

    await expect(
      fork({ cwd: targetCwd, srcJsonlPath, srcJsonlId: JSONL_ID, remoteControl: false })
    ).rejects.toThrow(/already watched/);

    expect(mockTmux.sessions.size).toBe(0);
    // Pre-existing entry untouched
    expect(loadState().entries).toHaveLength(1);
    expect(loadState().entries[0].pinnedJsonl).toBe("existing");
  });

  test("fork refuses when target cwd has a live tmux session", async () => {
    const srcJsonlPath = await prepareSource("/home/user/src");
    const targetCwd = `${f.root}/home/user/tgt`;
    const { cwdToTmuxName } = await import("../../src/core/slug");
    mockTmux.newSession(cwdToTmuxName(targetCwd), targetCwd, "existing claude");

    await expect(
      fork({ cwd: targetCwd, srcJsonlPath, srcJsonlId: JSONL_ID, remoteControl: false })
    ).rejects.toThrow(/active session in target cwd/);

    // Pre-existing tmux untouched
    expect(mockTmux.sessions.size).toBe(1);
    expect(mockTmux.sessions.get(cwdToTmuxName(targetCwd))!.cmd).toBe("existing claude");
    expect(loadState().entries).toHaveLength(0);
  });

  test("fork rejects invalid source jsonl ID", async () => {
    const srcJsonlPath = await prepareSource("/home/user/src");
    await expect(
      fork({ cwd: `${f.root}/home/user/tgt`, srcJsonlPath, srcJsonlId: "not-a-uuid", remoteControl: false })
    ).rejects.toThrow("invalid jsonl ID");
  });

  test("fork rejects missing source jsonl", async () => {
    await expect(
      fork({
        cwd: `${f.root}/home/user/tgt`,
        srcJsonlPath: `${f.root}/does-not-exist.jsonl`,
        srcJsonlId: JSONL_ID,
        remoteControl: false,
      })
    ).rejects.toThrow(/source jsonl does not exist/);
  });

  test("fork strips trailing slash from target cwd in watched state and tmux", async () => {
    const srcJsonlPath = await prepareSource("/home/user/src");
    const targetCwdRaw = `${f.root}/home/user/tgt/`;
    const targetCwdClean = `${f.root}/home/user/tgt`;

    await fork({ cwd: targetCwdRaw, srcJsonlPath, srcJsonlId: JSONL_ID, remoteControl: false });

    const state = loadState();
    expect(state.entries).toHaveLength(1);
    // Stored cwd has no trailing slash — otherwise picker adds a phantom
    // row because discovered jsonls resolve to the clean path and don't
    // match the watched entry's dirty path.
    expect(state.entries[0].cwd).toBe(targetCwdClean);

    const { cwdToTmuxName } = await import("../../src/core/slug");
    const sessions = Array.from(mockTmux.sessions.entries());
    expect(sessions).toHaveLength(1);
    expect(sessions[0][0]).toBe(cwdToTmuxName(targetCwdClean));
  });

  test("buildClaudeCmd with fork: true appends --fork-session", async () => {
    const { buildClaudeCmd } = await import("../../src/core/actions");
    const cmd = buildClaudeCmd(JSONL_ID, { fork: true });
    expect(cmd).toContain(`--resume ${JSONL_ID}`);
    expect(cmd).toContain("--fork-session");
  });
});
