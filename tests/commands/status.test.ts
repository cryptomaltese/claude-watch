import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { runStatus } from "../../src/commands/status";
import { setTmuxDriver, MockTmuxDriver } from "../../src/core/tmux";
import { makeFixture, makeUserEvent, type Fixture } from "../helpers/fixture";

const JSONL_ID = "aaaaaaaa-0001-0001-0001-aaaaaaaaaaaa";

describe("status command", () => {
  let f: Fixture;
  let output: string[];
  let origLog: typeof console.log;

  beforeEach(() => {
    f = makeFixture();
    f.setEnv();
    setTmuxDriver(new MockTmuxDriver());
    output = [];
    origLog = console.log;
    console.log = (...args: unknown[]) => output.push(args.join(" "));
  });

  afterEach(() => {
    console.log = origLog;
    f.restoreEnv();
    f.cleanup();
  });

  test("prints no watched sessions when empty", async () => {
    await runStatus([]);
    expect(output[0]).toBe("No watched sessions.");
  });

  test("prints table for watched entries", async () => {
    f.addWatched([
      { cwd: "/home/user/proj", pinnedJsonl: "abcdef-123", pinnedAt: "2026-01-01T00:00:00Z" },
    ]);
    await runStatus([]);
    expect(output.join("\n")).toContain("DEAD");
    expect(output.join("\n")).toContain("abcdef-1...");
  });

  test("--json emits enriched session list", async () => {
    f.addSession("/home/user/alpha", JSONL_ID, [makeUserEvent("hello")]);
    const cwdA = `${f.root}/home/user/alpha`;
    f.addWatched([{ cwd: cwdA, pinnedJsonl: JSONL_ID, pinnedAt: "2026-01-01T00:00:00Z" }]);

    await runStatus(["--json"]);
    const parsed = JSON.parse(output.join("\n"));
    expect(Array.isArray(parsed.sessions)).toBe(true);
    expect(parsed.totalCount).toBe(parsed.sessions.length);
    const session = parsed.sessions.find((s: { jsonlId: string }) => s.jsonlId === JSONL_ID);
    expect(session).toBeTruthy();
    expect(session.cwd).toBe(cwdA);
    expect(session.isWatched).toBe(true);
    expect(typeof session.brandNew).toBe("boolean");
  });

  test("--json includes synthetic brand-new entries for watched cwds without jsonl", async () => {
    const cwd = `${f.root}/home/user/fresh`;
    f.addWatched([{ cwd, pinnedJsonl: null, pinnedAt: "2026-01-01T00:00:00Z" }]);

    await runStatus(["--json"]);
    const parsed = JSON.parse(output.join("\n"));
    const brandNew = parsed.sessions.find((s: { cwd: string; brandNew: boolean }) => s.cwd === cwd && s.brandNew);
    expect(brandNew).toBeTruthy();
    expect(brandNew.isWatched).toBe(true);
  });
});
