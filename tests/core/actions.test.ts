import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { activate, deactivate, createNew, refresh } from "../../src/core/actions";
import { loadState } from "../../src/core/state";
import { setTmuxDriver, MockTmuxDriver } from "../../src/core/tmux";
import { makeFixture, makeUserEvent, type Fixture } from "../helpers/fixture";
import { readFileSync } from "node:fs";

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

  test("buildClaudeCmd omits --fork-session by default", async () => {
    const { buildClaudeCmd } = await import("../../src/core/actions");
    const cmd = buildClaudeCmd(JSONL_ID);
    expect(cmd).toContain(`--resume ${JSONL_ID}`);
    expect(cmd).not.toContain("--fork-session");
  });

  test("buildClaudeCmd appends --fork-session when forkOnResume=true", async () => {
    const { writeFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    writeFileSync(
      join(process.env.CLAUDE_WATCH_CONFIG_DIR!, "config.json"),
      JSON.stringify({ forkOnResume: true })
    );
    const { buildClaudeCmd } = await import("../../src/core/actions");
    const cmd = buildClaudeCmd(JSONL_ID);
    expect(cmd).toContain(`--resume ${JSONL_ID}`);
    expect(cmd).toContain("--fork-session");
  });

  test("buildClaudeCmd omits --fork-session when no jsonlId (fresh session)", async () => {
    const { writeFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    writeFileSync(
      join(process.env.CLAUDE_WATCH_CONFIG_DIR!, "config.json"),
      JSON.stringify({ forkOnResume: true })
    );
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
});
