import React, { useState, useEffect } from "react";
import { Box, Text, useStdout } from "ink";
import { extractPeek } from "../core/sessions.js";
import { loadConfig } from "../core/config.js";
import { theme } from "./theme.js";

interface Props {
  jsonlPath: string;
}

// ActionMenu chrome around the peek panel:
//   border (2) + paddingY (2) + name line (1) + marginTop-before-peek (1)
//   + marginTop-before-actions (1) + actions header (1)
//   + up to 6 action rows (deactivate±attach, refresh±attach, fork±attach)
//   + marginTop-before-hint (1) + hint (1)
//   = 16 rows of non-peek content at most; add a 2-row safety margin.
// The peek panel adds its own header (title + separator = 2 rows).
// Each peek event renders as 1 content row + 1 marginBottom = 2 rows —
// this only holds when sessions.ts's truncate() collapses all whitespace
// and Text uses wrap="truncate"; both changes went in together.
const CHROME_ROWS = 18;
const PEEK_HEADER_ROWS = 2;
const ROWS_PER_PEEK_EVENT = 2;

export function PeekPanel({ jsonlPath }: Props): React.ReactElement | null {
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const config = loadConfig();
  const { stdout } = useStdout();
  const terminalRows = stdout?.rows ?? 24;

  // Cap peek events to fit the terminal. Fallback to config.peekLines if
  // there's comfortably enough room.
  const roomForEvents = Math.max(
    0,
    Math.floor((terminalRows - CHROME_ROWS - PEEK_HEADER_ROWS) / ROWS_PER_PEEK_EVENT),
  );
  const maxDisplayed = Math.min(config.peekLines, roomForEvents);

  useEffect(() => {
    setLoading(true);
    // Fetch enough to satisfy max possible display; actual shown is
    // capped by maxDisplayed at render time.
    extractPeek(jsonlPath, config.peekLines).then((result) => {
      setLines(result);
      setLoading(false);
    });
  }, [jsonlPath, config.peekLines]);

  // On very short terminals, hide the peek panel entirely to make room
  // for the critical actions. The name line at the top still gives the
  // user session context.
  if (maxDisplayed < 1) return null;

  const displayed = lines.slice(0, maxDisplayed);
  const truncated = lines.length > maxDisplayed;

  return (
    <Box flexDirection="column" paddingX={1} flexShrink={1} overflow="hidden">
      <Text color={theme.dim}>
        peek (last {displayed.length}
        {truncated ? ` of ${lines.length} — terminal size limit` : ""})
      </Text>
      <Text color={theme.dim}>{"─".repeat(60)}</Text>
      {loading ? (
        <Text color={theme.dim}>reading transcript…</Text>
      ) : (
        displayed.map((line, i) => (
          <Box key={i} marginBottom={1}>
            <Text color={theme.dim} wrap="truncate">{line}</Text>
          </Box>
        ))
      )}
    </Box>
  );
}
