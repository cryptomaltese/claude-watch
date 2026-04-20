import React, { useState, useMemo } from "react";
import { Box, Text, useInput, useApp, useStdout } from "ink";
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
  const { exit } = useApp();
  const { stdout } = useStdout();

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
    else if (input === "u" && key.ctrl) { setQuery(""); setSelectedIndex(0); setPage(0); }
    else if (key.backspace || key.delete) { setQuery((q) => q.slice(0, -1)); setSelectedIndex(0); setPage(0); }
    else if (
      input && !key.ctrl && !key.meta && !key.return &&
      !key.upArrow && !key.downArrow && !key.pageUp && !key.pageDown
    ) {
      setQuery((q) => q + input);
      setSelectedIndex(0);
      setPage(0);
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

  // Outer container pinned to terminal dimensions so every screen transition
  // produces a constant-size frame. Prevents row-count deltas between
  // renders that some terminals (PuTTY, nested tmux) mis-reconcile — the
  // "double panel" artifact visible after refresh→back→reselect.
  const outerHeight = stdout?.rows ?? 24;

  let content: React.ReactElement;
  if (loading) {
    content = <Box paddingX={1}><Text>loading sessions…</Text></Box>;
  } else if (screen === "action" && selectedSession) {
    content = <ActionMenu session={selectedSession} onBack={handleBack} />;
  } else if (screen === "new") {
    content = <NewSessionInput onBack={handleBack} />;
  } else {
    content = (
      <SessionList
        sessions={paged} query={query} searching={searching}
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

  return (
    <Box flexDirection="column" height={outerHeight} overflow="hidden">
      {content}
    </Box>
  );
}
