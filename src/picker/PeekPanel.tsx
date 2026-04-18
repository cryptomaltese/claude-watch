import React, { useState, useEffect } from "react";
import { Box, Text, useStdout } from "ink";
import { extractPeek } from "../core/sessions.js";
import { loadConfig } from "../core/config.js";
import { theme } from "./theme.js";

interface Props {
  jsonlPath: string;
}

// Rough reservation for the rest of the ActionMenu (border + header + action
// rows + hint line). Peek box gets whatever remains after this.
const CHROME_ROW_BUDGET = 14;
const MIN_PEEK_ROWS = 4;

export function PeekPanel({ jsonlPath }: Props): React.ReactElement {
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const config = loadConfig();
  const { stdout } = useStdout();

  useEffect(() => {
    setLoading(true);
    extractPeek(jsonlPath, config.peekLines).then((result) => {
      setLines(result);
      setLoading(false);
    });
  }, [jsonlPath, config.peekLines]);

  const availableRows = stdout?.rows ?? 24;
  const peekBoxHeight = Math.max(MIN_PEEK_ROWS, availableRows - CHROME_ROW_BUDGET);

  return (
    <Box
      flexDirection="column"
      paddingX={1}
      height={peekBoxHeight}
      overflow="hidden"
    >
      <Text color={theme.dim}>peek (last {config.peekLines})</Text>
      <Text color={theme.dim}>{"─".repeat(60)}</Text>
      {loading ? (
        <Text color={theme.dim}>reading transcript…</Text>
      ) : (
        lines.map((line, i) => (
          <Box key={i} marginBottom={1}>
            <Text color={theme.dim} wrap="wrap">{line}</Text>
          </Box>
        ))
      )}
    </Box>
  );
}
