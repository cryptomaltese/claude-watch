import React, { useState, useMemo } from "react";
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
  const { exit } = useApp();

  const {
    sessions, allSessions, loading, page, totalPages,
    nextPage, prevPage, reload, totalCount, watchedCount,
  } = useSessions();

  const allIds = useMemo(
    () => new Set(allSessions.map((s) => s.jsonlId)),
    [allSessions]
  );

  const { matchingIds, searching } = useSearch(query, allIds);

  const filtered = matchingIds
    ? sessions.filter((s) => matchingIds.has(s.jsonlId))
    : sessions;

  useInput((input, key) => {
    if (screen !== "list") return;
    if (key.escape || (input === "c" && key.ctrl)) { exit(); }
    else if (input === "d" && key.ctrl) { exit(); }
    else if (input === "u" && key.ctrl) { setQuery(""); setSelectedIndex(0); }
    else if (key.backspace || key.delete) { setQuery((q) => q.slice(0, -1)); setSelectedIndex(0); }
    else if (
      input && !key.ctrl && !key.meta && !key.return &&
      !key.upArrow && !key.downArrow && !key.pageUp && !key.pageDown
    ) {
      setQuery((q) => q + input);
      setSelectedIndex(0);
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
      sessions={filtered} query={query} searching={searching}
      selectedIndex={selectedIndex} onSelect={handleSelect}
      onIndexChange={setSelectedIndex} onNewSession={() => setScreen("new")}
      page={page} totalPages={totalPages}
      totalCount={matchingIds ? matchingIds.size : totalCount}
      watchedCount={watchedCount} onNextPage={nextPage} onPrevPage={prevPage}
    />
  );
}
