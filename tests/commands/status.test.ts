import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { runStatus } from "../../src/commands/status";
import { setTmuxDriver, MockTmuxDriver } from "../../src/core/tmux";
import { makeFixture, makeUserEvent, type Fixture } from "../helpers/fixture";

const JSONL_ID_A = "aaaaaaaa-0001-0001-0001-aaaaaaaaaaaa";
const JSONL_ID_B = "bbbbbbbb-0002-0002-0002-bbbbbbbbbbbb";

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

  test("--json emits valid JSON with enriched session fields", async () => {
    f.addSession("/home/user/alpha", JSONL_ID_A, [makeUserEvent("hello")]);
    const cwdA = `${f.root}/home/user/alpha`;
    f.addWatched([{ cwd: cwdA, pinnedJsonl: JSONL_ID_A, pinnedAt: "2026-01-01T00:00:00Z" }]);

    await runStatus(["--json"]);
    const parsed = JSON.parse(output.join("\n"));
    expect(Array.isArray(parsed.sessions)).toBe(true);
    expect(parsed.sessions.length).toBeGreaterThanOrEqual(1);
    const session = parsed.sessions.find((s: { jsonlId: string }) => s.jsonlId === JSONL_ID_A);
    expect(session).toBeTruthy();
    expect(session.cwd).toBe(cwdA);
    expect(session.isWatched).toBe(true);
    expect(typeof session.isAlive).toBe("boolean");
    expect(typeof session.brandNew).toBe("boolean");
    expect(typeof session.mtime).toBe("string"); // ISO string
    expect(typeof session.lastEvent).toBe("string");
  });

  test("--json includes synthetic brand-new entries for watched cwds without jsonl", async () => {
    const cwd = `${f.root}/home/user/fresh`;
    f.addWatched([{ cwd, pinnedJsonl: null, pinnedAt: "2026-01-01T00:00:00Z" }]);

    await runStatus(["--json"]);
    const parsed = JSON.parse(output.join("\n"));
    const brandNew = parsed.sessions.find((s: { cwd: string; brandNew: boolean }) => s.cwd === cwd && s.brandNew);
    expect(brandNew).toBeTruthy();
    expect(brandNew.isWatched).toBe(true);
    expect(brandNew.jsonlId).toBe("");
  });

  test("--search filters by cwd substring (case-insensitive)", async () => {
    // Using non-hyphenated dir names — hyphenated dir slug reversal is
    // a known limitation and not what this test targets.
    f.addSession("/home/user/alpharoject", JSONL_ID_A, [makeUserEvent("hi")]);
    f.addSession("/home/user/bravo", JSONL_ID_B, [makeUserEvent("hi")]);
    const cwdAlpha = `${f.root}/home/user/alpharoject`;
    const cwdBravo = `${f.root}/home/user/bravo`;

    await runStatus(["--json", "--search", "ALPHA"]);
    const parsed = JSON.parse(output.join("\n"));
    const cwds = parsed.sessions.map((s: { cwd: string }) => s.cwd);
    expect(cwds).toContain(cwdAlpha);
    expect(cwds).not.toContain(cwdBravo);
  });

  test("--search filters by lastEvent substring", async () => {
    f.addSession("/home/user/alpha", JSONL_ID_A, [makeUserEvent("talking about memory leak")]);
    f.addSession("/home/user/bravo", JSONL_ID_B, [makeUserEvent("something else entirely")]);

    await runStatus(["--json", "--search", "memory leak"]);
    const parsed = JSON.parse(output.join("\n"));
    const jsonlIds = parsed.sessions.map((s: { jsonlId: string }) => s.jsonlId);
    expect(jsonlIds).toContain(JSONL_ID_A);
    expect(jsonlIds).not.toContain(JSONL_ID_B);
  });

  test("--page returns nth page with envelope metadata", async () => {
    // Create 12 sessions; pageSize defaults to 10
    for (let i = 0; i < 12; i++) {
      const id = `cccccccc-0003-0003-0003-${i.toString().padStart(12, "0")}`;
      f.addSession(`/home/user/s${i}`, id, [makeUserEvent("hi")]);
    }

    await runStatus(["--json", "--page", "1"]);
    const p1 = JSON.parse(output.join("\n"));
    expect(p1.sessions.length).toBe(10);
    expect(p1.page.current).toBe(1);
    expect(p1.page.total).toBe(2);

    output.length = 0;
    await runStatus(["--json", "--page", "2"]);
    const p2 = JSON.parse(output.join("\n"));
    expect(p2.sessions.length).toBe(2);
    expect(p2.page.current).toBe(2);
    expect(p2.page.total).toBe(2);
  });
});
