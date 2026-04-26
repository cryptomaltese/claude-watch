import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  loadState, saveState, addEntry, removeEntry,
  upsertEntry, rollForward, type WatchedState, type WatchedEntry,
} from "../../src/core/state";
import { makeFixture, type Fixture } from "../helpers/fixture";

describe("state", () => {
  let f: Fixture;

  beforeEach(() => { f = makeFixture(); f.setEnv(); });
  afterEach(() => { f.restoreEnv(); f.cleanup(); });

  test("loadState returns empty state when no file", () => {
    const state = loadState();
    expect(state.version).toBe(1);
    expect(state.entries).toHaveLength(0);
  });

  test("loadState reads existing watched.json", () => {
    f.addWatched([{ cwd: "/a", pinnedJsonl: "abc", pinnedAt: "2026-01-01T00:00:00Z" }]);
    const state = loadState();
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0].cwd).toBe("/a");
  });

  test("saveState + loadState round-trip", () => {
    const state: WatchedState = {
      version: 1,
      entries: [{ cwd: "/b", pinnedJsonl: "def", pinnedAt: "2026-02-01T00:00:00Z" }],
    };
    saveState(state);
    const loaded = loadState();
    expect(loaded).toEqual(state);
  });

  test("addEntry appends to state", () => {
    const state = loadState();
    const entry: WatchedEntry = { cwd: "/c", pinnedJsonl: "ghi", pinnedAt: new Date().toISOString() };
    const updated = addEntry(state, entry);
    expect(updated.entries).toHaveLength(1);
    expect(updated.entries[0].cwd).toBe("/c");
  });

  test("removeEntry removes by cwd", () => {
    const state: WatchedState = {
      version: 1,
      entries: [
        { cwd: "/a", pinnedJsonl: "x", pinnedAt: "2026-01-01T00:00:00Z" },
        { cwd: "/b", pinnedJsonl: "y", pinnedAt: "2026-01-01T00:00:00Z" },
      ],
    };
    const updated = removeEntry(state, "/a");
    expect(updated.entries).toHaveLength(1);
    expect(updated.entries[0].cwd).toBe("/b");
  });

  test("upsertEntry updates existing entry by cwd", () => {
    const state: WatchedState = {
      version: 1,
      entries: [{ cwd: "/a", pinnedJsonl: "old", pinnedAt: "2026-01-01T00:00:00Z" }],
    };
    const updated = upsertEntry(state, { cwd: "/a", pinnedJsonl: "new", pinnedAt: "2026-02-01T00:00:00Z" });
    expect(updated.entries).toHaveLength(1);
    expect(updated.entries[0].pinnedJsonl).toBe("new");
  });

  test("rollForward picks newer jsonl", () => {
    const entry: WatchedEntry = { cwd: "/a", pinnedJsonl: "abc", pinnedAt: "2026-01-01T00:00:00Z" };
    const jsonls = [
      { id: "abc", mtime: new Date("2026-01-01") },
      { id: "def", mtime: new Date("2026-02-01") },
    ];
    const result = rollForward(entry, jsonls);
    expect(result.pinnedJsonl).toBe("def");
  });

  test("rollForward no-ops when nothing newer", () => {
    const entry: WatchedEntry = { cwd: "/a", pinnedJsonl: "abc", pinnedAt: "2026-03-01T00:00:00Z" };
    const jsonls = [{ id: "abc", mtime: new Date("2026-01-01") }];
    const result = rollForward(entry, jsonls);
    expect(result.pinnedJsonl).toBe("abc");
  });
});
