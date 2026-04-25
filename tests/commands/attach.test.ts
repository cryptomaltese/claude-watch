import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { runAttach } from "../../src/commands/attach";
import { setTmuxDriver, MockTmuxDriver } from "../../src/core/tmux";
import { cwdToTmuxName } from "../../src/core/slug";
import { makeFixture, makeUserEvent, type Fixture } from "../helpers/fixture";

const JSONL_ID = "dddddddd-0004-0004-0004-dddddddddddd";

describe("attach command", () => {
  let f: Fixture;
  let mockTmux: MockTmuxDriver;
  let output: string[];
  let origLog: typeof console.log;
  let savedTmuxEnv: string | undefined;

  beforeEach(() => {
    f = makeFixture();
    f.setEnv();
    mockTmux = new MockTmuxDriver();
    setTmuxDriver(mockTmux);
    output = [];
    origLog = console.log;
    console.log = (...args: unknown[]) => output.push(args.join(" "));
    // Simulate being inside tmux
    savedTmuxEnv = process.env.TMUX;
    process.env.TMUX = "/tmp/tmux-fake";
  });

  afterEach(() => {
    console.log = origLog;
    if (savedTmuxEnv === undefined) delete process.env.TMUX;
    else process.env.TMUX = savedTmuxEnv;
    f.restoreEnv();
    f.cleanup();
    setTmuxDriver(null!);
  });

  test("watched alive → switches client, no state mutation", async () => {
    f.addSession("/home/user/proj", JSONL_ID, [makeUserEvent("hi")]);
    const cwd = `${f.root}/home/user/proj`;
    const tmuxName = cwdToTmuxName(cwd);
    mockTmux.newSession(tmuxName, cwd, "claude");
    f.addWatched([{ cwd, pinnedJsonl: JSONL_ID, pinnedAt: "2026-01-01T00:00:00Z" }]);

    await runAttach([cwd]);

    expect(mockTmux.switchedTo).toBe(tmuxName);
    // Watched entry untouched
    const watched = f.readWatched();
    expect(watched.entries).toHaveLength(1);
    expect(watched.entries[0].pinnedJsonl).toBe(JSONL_ID);
  });

  test("watched dead → auto-resuscitates then switches", async () => {
    f.addSession("/home/user/proj", JSONL_ID, [makeUserEvent("hi")]);
    const cwd = `${f.root}/home/user/proj`;
    f.addWatched([{ cwd, pinnedJsonl: JSONL_ID, pinnedAt: "2026-01-01T00:00:00Z" }]);
    // No tmux session seeded — dead

    await runAttach([cwd]);

    const tmuxName = cwdToTmuxName(cwd);
    expect(mockTmux.hasSession(tmuxName)).toBe(true);
    expect(mockTmux.sessions.get(tmuxName)!.cmd).toContain(`--resume ${JSONL_ID}`);
    expect(mockTmux.switchedTo).toBe(tmuxName);
  });

  test("watched brand-new dead → auto-spawns fresh (no --resume) then switches", async () => {
    const cwd = `${f.root}/home/user/fresh`;
    f.addWatched([{ cwd, pinnedJsonl: null, pinnedAt: "2026-01-01T00:00:00Z" }]);

    await runAttach([cwd]);

    const tmuxName = cwdToTmuxName(cwd);
    expect(mockTmux.hasSession(tmuxName)).toBe(true);
    expect(mockTmux.sessions.get(tmuxName)!.cmd).not.toContain("--resume");
    expect(mockTmux.switchedTo).toBe(tmuxName);
  });

  test("unwatched alive → switches, no state mutation", async () => {
    const cwd = `${f.root}/home/user/manual`;
    const tmuxName = cwdToTmuxName(cwd);
    mockTmux.newSession(tmuxName, cwd, "claude");

    await runAttach([cwd]);

    expect(mockTmux.switchedTo).toBe(tmuxName);
    // loadState (not readWatched) so the assertion works whether or not
    // watched.json was ever written — attach on an unwatched session
    // should not create the file.
    const { loadState } = await import("../../src/core/state");
    expect(loadState().entries).toHaveLength(0);
  });

  test("unwatched dead → refuses with activate-first message", async () => {
    const cwd = `${f.root}/home/user/orphan`;

    await expect(runAttach([cwd])).rejects.toThrow(/not watched/i);
    expect(mockTmux.switchedTo).toBeNull();
  });

  test("$TMUX unset → prints fallback hint, does not call switchClient", async () => {
    delete process.env.TMUX;
    f.addSession("/home/user/proj", JSONL_ID, [makeUserEvent("hi")]);
    const cwd = `${f.root}/home/user/proj`;
    const tmuxName = cwdToTmuxName(cwd);
    mockTmux.newSession(tmuxName, cwd, "claude");
    f.addWatched([{ cwd, pinnedJsonl: JSONL_ID, pinnedAt: "2026-01-01T00:00:00Z" }]);

    await runAttach([cwd]);

    expect(mockTmux.switchedTo).toBeNull();
    expect(output.join("\n")).toContain("tmux attach");
    expect(output.join("\n")).toContain(tmuxName);
  });

  test("strips trailing slash from cwd arg", async () => {
    f.addSession("/home/user/proj", JSONL_ID, [makeUserEvent("hi")]);
    const cwd = `${f.root}/home/user/proj`;
    const tmuxName = cwdToTmuxName(cwd);
    mockTmux.newSession(tmuxName, cwd, "claude");
    f.addWatched([{ cwd, pinnedJsonl: JSONL_ID, pinnedAt: "2026-01-01T00:00:00Z" }]);

    await runAttach([cwd + "/"]);

    expect(mockTmux.switchedTo).toBe(tmuxName);
  });
});
