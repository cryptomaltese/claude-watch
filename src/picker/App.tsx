import React, { useState, useMemo, useEffect, useRef } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { SessionList } from "./SessionList.js";
import { ActionMenu } from "./ActionMenu.js";
import { NewSessionInput } from "./NewSessionInput.js";
import { useSessions } from "./hooks/useSessions.js";
import { useSearch } from "./hooks/useSearch.js";
import type { Session } from "../core/sessions.js";

type Screen = "list" | "action" | "new";

export function App(): React.ReactElement {
  const [screen, setScreen] = useState<Screen>("list");
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  // Tracks where the user's last input landed — search field vs list.
  // Not enforced (both handlers keep listening), just a display hint so
  // we can color the search label/cursor when typing is "active".
  const [searchFocused, setSearchFocused] = useState(false);
  const { exit } = useApp();

  const {
    allSessions, loading, pageSize,
    reload, watchedCount,
  } = useSessions();

  const [page, setPage] = useState(0);

  const allIds = useMemo(
    () => new Set(allSessions.map((s) => s.jsonlId)),
    [allSessions]
  );

  const { matchingIds, searching } = useSearch(query, allIds);

  // Filter first (across ALL sessions), then paginate the result
  const filtered = matchingIds
    ? allSessions.filter((s) => matchingIds.has(s.jsonlId))
    : allSessions;

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);

  useInput((input, key) => {
    if (screen !== "list") return;
    if (key.escape || (input === "c" && key.ctrl)) { exit(); }
    else if (input === "d" && key.ctrl) { exit(); }
    else if (input === "u" && key.ctrl) {
      setQuery(""); setSelectedIndex(0); setPage(0); setSearchFocused(true);
    }
    else if (key.backspace || key.delete) {
      setQuery((q) => q.slice(0, -1)); setSelectedIndex(0); setPage(0);
      setSearchFocused(true);
    }
    else if (key.upArrow || key.downArrow || key.pageUp || key.pageDown) {
      // Nav goes to SessionList — mark search as unfocused.
      setSearchFocused(false);
    }
    else if (
      input && !key.ctrl && !key.meta && !key.return
    ) {
      setQuery((q) => q + input);
      setSelectedIndex(0);
      setPage(0);
      setSearchFocused(true);
    }
  });

  function handleSelect(session: Session): void {
    setSelectedSession(session);
    setScreen("action");
  }

  function handleBack(): void {
    setScreen("list");
    setSelectedSession(null);
    reload();
  }

  // Force a full repaint on every screen transition via Ink's clear().
  // Ink's own API clears the terminal AND resets its internal frame-diff
  // state — critical: raw ANSI clears wipe pixels but leave Ink thinking
  // it drew N rows, so the next re-render (e.g., arrow-nav within the
  // new screen) ends up writing below the real cursor, producing a
  // ghost panel. The clear is exposed on globalThis by pick.ts so the
  // App can reach it without threading refs through the whole tree.
  const lastScreenRef = useRef<Screen | null>(null);
  useEffect(() => {
    if (lastScreenRef.current !== null && lastScreenRef.current !== screen) {
      const inkClear = (globalThis as { __claudeWatchInkClear?: () => void }).__claudeWatchInkClear;
      inkClear?.();
    }
    lastScreenRef.current = screen;
  }, [screen]);

  if (loading) {
    return <Box paddingX={1}><Text>loading sessions…</Text></Box>;
  }

  if (screen === "action" && selectedSession) {
    return <ActionMenu session={selectedSession} onBack={handleBack} />;
  }

  if (screen === "new") {
    return <NewSessionInput onBack={handleBack} />;
  }

  return (
    <SessionList
      sessions={paged} query={query} searching={searching}
      searchFocused={searchFocused}
      selectedIndex={selectedIndex} onSelect={handleSelect}
      onIndexChange={setSelectedIndex} onNewSession={() => setScreen("new")}
      page={page} totalPages={totalPages}
      totalCount={filtered.length}
      watchedCount={watchedCount}
      onNextPage={() => { setPage((p) => Math.min(p + 1, totalPages - 1)); setSelectedIndex(0); }}
      onPrevPage={() => { setPage((p) => Math.max(p - 1, 0)); setSelectedIndex(0); }}
    />
  );
}
