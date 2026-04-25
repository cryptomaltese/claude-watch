import { describe, test, expect } from "bun:test";
import { render } from "ink-testing-library";
import React from "react";
import { SessionList } from "../../src/picker/SessionList";
import type { Session } from "../../src/core/sessions";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    jsonlPath: "/tmp/test.jsonl",
    jsonlId: "abc-123",
    slug: "-home-user-proj",
    cwd: "/home/user/proj",
    mtime: new Date(),
    lastEvent: "test message",
    isWatched: false,
    isAlive: false,
    ...overrides,
  };
}

const noop = () => {};

describe("SessionList", () => {
  test("renders session rows", () => {
    const sessions = [
      makeSession({ jsonlId: "a", cwd: "/home/user/alpha", lastEvent: "hello alpha" }),
      makeSession({ jsonlId: "b", cwd: "/home/user/beta", lastEvent: "hello beta", isWatched: true }),
    ];
    const { lastFrame } = render(
      <SessionList
        sessions={sessions} query="" searching={false} searchFocused={false} selectedIndex={0}
        onSelect={noop} onIndexChange={noop} onNewSession={noop}
        page={0} totalPages={1} totalCount={2} watchedCount={1}
        onNextPage={noop} onPrevPage={noop}
      />
    );
    const frame = lastFrame();
    expect(frame).toContain("alpha");
    expect(frame).toContain("beta");
    expect(frame).toContain("watched");
  });

  test("shows empty message when no matches", () => {
    const { lastFrame } = render(
      <SessionList
        sessions={[]} query="nonexistent" searching={false} searchFocused={true} selectedIndex={0}
        onSelect={noop} onIndexChange={noop} onNewSession={noop}
        page={0} totalPages={1} totalCount={0} watchedCount={0}
        onNextPage={noop} onPrevPage={noop}
      />
    );
    expect(lastFrame()).toContain("No sessions found");
  });
});
