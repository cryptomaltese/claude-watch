import React from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { theme } from "./theme.js";
import type { Session } from "../core/sessions.js";

// Embedded at bundle time by bun's banner hook — used so users can verify
// they're running the expected build and not a stale cached copy.
declare const __CW_BUILD__: string;
const buildStamp = typeof __CW_BUILD__ !== "undefined" ? __CW_BUILD__ : "dev";

interface Props {
  sessions: Session[];
  query: string;
  searching: boolean;
  searchFocused: boolean;
  selectedIndex: number;
  onSelect: (session: Session) => void;
  onIndexChange: (index: number) => void;
  onNewSession: () => void;
  page: number;
  totalPages: number;
  totalCount: number;
  watchedCount: number;
  onNextPage: () => void;
  onPrevPage: () => void;
}

function relativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

export function SessionList(props: Props): React.ReactElement {
  const {
    sessions, query, searching, searchFocused, selectedIndex,
    onSelect, onIndexChange, onNewSession,
    page, totalPages, totalCount, watchedCount,
    onNextPage, onPrevPage,
  } = props;

  useInput((input, key) => {
    if (key.upArrow) {
      onIndexChange(Math.max(0, selectedIndex - 1));
    } else if (key.downArrow) {
      onIndexChange(Math.min(sessions.length - 1, selectedIndex + 1));
    } else if (key.pageDown) {
      onNextPage();
      onIndexChange(0);
    } else if (key.pageUp) {
      onPrevPage();
      onIndexChange(0);
    } else if (key.return) {
      if (sessions[selectedIndex]) onSelect(sessions[selectedIndex]);
    } else if (input === "n" && key.ctrl) {
      onNewSession();
    }
  });

  const { stdout } = useStdout();
  const termDims = `${stdout?.columns ?? "?"}×${stdout?.rows ?? "?"}`;
  const statusLine = [
    `${totalCount} sessions`,
    `${watchedCount} watched`,
    query ? `filter: ${query}` : null,
    searching ? "searching…" : null,
    `term ${termDims}`,
    `build ${buildStamp}`,
  ].filter(Boolean).join(" · ");

  return (
    <Box flexDirection="column">
      <Box borderStyle={theme.border} paddingX={1}>
        <Text color={theme.fg}>claude-watch · pick a session</Text>
        <Text color={theme.dim}> — {statusLine}</Text>
      </Box>

      <Box paddingX={1}>
        {/*
          Subtle cues:
          - searchFocused flips the label color (accent vs dim) and shows
            a bright "_" cursor, so the user can tell typing lands here.
          - query.length > 0 makes the typed text accent-colored, so the
            "filter is active" state is visible even when focus is on the
            list.
        */}
        <Text color={searchFocused ? theme.accent : theme.dim}>search › </Text>
        <Text color={query.length > 0 ? theme.accent : theme.fg}>{query}</Text>
        {searchFocused && <Text color={theme.accent}>_</Text>}
      </Box>

      <Box flexDirection="column" paddingX={1} marginTop={1}>
        {sessions.length === 0 && query && (
          <Text color={theme.dim}>No sessions found with &quot;{query}&quot;</Text>
        )}

        {sessions.map((session, i) => {
          const isSelected = i === selectedIndex;
          const indicator = session.isAlive ? "●" : "○";
          const indicatorColor = session.isAlive
            ? theme.accent
            : session.isWatched ? theme.fg : theme.dim;
          const nameColor = session.isAlive
            ? theme.fg
            : session.isWatched ? theme.fg : theme.dim;
          const detailColor = session.isAlive ? theme.fg : theme.dim;
          const name = session.cwd
            ? session.cwd.split("/").pop() ?? session.slug
            : session.slug;

          return (
            <Box key={session.jsonlId} flexDirection="column" marginBottom={1}>
              <Box>
                {isSelected && <Text color={theme.accent}>❯ </Text>}
                {!isSelected && <Text>  </Text>}
                <Text color={indicatorColor} bold={session.isAlive}>{indicator} </Text>
                <Text color={nameColor} bold={session.isAlive || isSelected}>
                  {name}
                </Text>
                <Text color={theme.dim}>  {relativeTime(session.mtime)}</Text>
                {session.isAlive && <Text color={theme.accent} bold>  live</Text>}
                {session.isWatched && !session.isAlive && (
                  <Text color={theme.dim}>  watched · dead</Text>
                )}
                {session.isWatched && session.isAlive && (
                  <Text color={theme.dim}>  watched</Text>
                )}
              </Box>
              <Box marginLeft={4}>
                <Text color={detailColor} dimColor={!session.isAlive}>
                  {session.cwd ?? session.slug}
                </Text>
              </Box>
              <Box marginLeft={4}>
                <Text color={detailColor} dimColor={!session.isAlive}>
                  &quot;{session.lastEvent}&quot;
                </Text>
              </Box>
            </Box>
          );
        })}
      </Box>

      <Box paddingX={1}>
        <Text color={theme.dim}>
          ↑↓ nav  pgdn more  ctrl-n new  ↵ select  esc quit
          {totalPages > 1 ? `  (page ${page + 1}/${totalPages})` : ""}
        </Text>
      </Box>
    </Box>
  );
}
