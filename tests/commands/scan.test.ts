import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { runScan } from "../../src/commands/scan";
import { loadState } from "../../src/core/state";
import { setTmuxDriver, MockTmuxDriver } from "../../src/core/tmux";
import { makeFixture, makeUserEvent, type Fixture } from "../helpers/fixture";

describe("scan command", () => {
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
  });

  test("revives dead watched session", async () => {
    f.addSession("/home/user/proj", "abc-123", [makeUserEvent("hi")]);
    f.addWatched([
      { cwd: `${f.root}/home/user/proj`, pinnedJsonl: "abc-123", pinnedAt: "2026-01-01T00:00:00Z" },
    ]);
    await runScan();
    const sessions = Array.from(mockTmux.sessions.entries());
    expect(sessions.length).toBe(1);
    expect(sessions[0][1].cmd).toContain("--resume abc-123");
  });

  test("skips alive sessions", async () => {
    f.addSession("/home/user/proj", "abc-123", [makeUserEvent("hi")]);
    f.addWatched([
      { cwd: `${f.root}/home/user/proj`, pinnedJsonl: "abc-123", pinnedAt: "2026-01-01T00:00:00Z" },
    ]);
    const { cwdToTmuxName } = await import("../../src/core/slug");
    const tmuxName = cwdToTmuxName(`${f.root}/home/user/proj`);
    mockTmux.newSession(tmuxName, "/tmp", "already running");
    await runScan();
    expect(mockTmux.sessions.get(tmuxName)!.cmd).toBe("already running");
  });

  test("prunes entries for deleted cwds", async () => {
    f.addWatched([
      { cwd: "/nonexistent/path", pinnedJsonl: "xyz", pinnedAt: "2026-01-01T00:00:00Z" },
    ]);
    await runScan();
    expect(loadState().entries).toHaveLength(0);
  });

  test("rolls forward to newer jsonl", async () => {
    f.addSession("/home/user/proj", "old-111", [makeUserEvent("old")]);
    await Bun.sleep(10);
    f.addSession("/home/user/proj", "new-222", [makeUserEvent("new")]);
    f.addWatched([
      { cwd: `${f.root}/home/user/proj`, pinnedJsonl: "old-111", pinnedAt: "2020-01-01T00:00:00Z" },
    ]);
    await runScan();
    expect(loadState().entries[0].pinnedJsonl).toBe("new-222");
  });
});
