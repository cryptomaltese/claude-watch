import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { activate, deactivate, createNew } from "../../src/core/actions";
import { loadState } from "../../src/core/state";
import { setTmuxDriver, MockTmuxDriver } from "../../src/core/tmux";
import { makeFixture, makeUserEvent, type Fixture } from "../helpers/fixture";
import { readFileSync } from "node:fs";

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
    f.addSession("/home/user/proj", "abc-123", [makeUserEvent("hi")]);
    const cwd = `${f.root}/home/user/proj`;
    await activate({ cwd, jsonlId: "abc-123", remoteControl: false });
    const state = loadState();
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0].cwd).toBe(cwd);
    expect(state.entries[0].pinnedJsonl).toBe("abc-123");
  });

  test("activate starts tmux session", async () => {
    f.addSession("/home/user/proj", "abc-123", [makeUserEvent("hi")]);
    const cwd = `${f.root}/home/user/proj`;
    await activate({ cwd, jsonlId: "abc-123", remoteControl: false });
    // The tmux name derives from the cwd path
    const sessions = Array.from(mockTmux.sessions.keys());
    expect(sessions.length).toBe(1);
    const session = mockTmux.sessions.get(sessions[0])!;
    expect(session.cmd).toContain("--resume abc-123");
  });

  test("activate writes sentinel when attach=true", async () => {
    const sentinelPath = `${f.root}/sentinel`;
    process.env.CLAUDE_WATCH_SENTINEL = sentinelPath;
    f.addSession("/home/user/proj", "abc-123", [makeUserEvent("hi")]);
    await activate({ cwd: `${f.root}/home/user/proj`, jsonlId: "abc-123", attach: true, remoteControl: false });
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
});
