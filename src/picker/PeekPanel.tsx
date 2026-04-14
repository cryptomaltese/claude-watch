import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { extractPeek } from "../core/sessions.js";
import { loadConfig } from "../core/config.js";
import { theme } from "./theme.js";

interface Props {
  jsonlPath: string;
}

export function PeekPanel({ jsonlPath }: Props): React.ReactElement {
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const config = loadConfig();

  useEffect(() => {
    setLoading(true);
    extractPeek(jsonlPath, config.peekLines).then((result) => {
      setLines(result);
      setLoading(false);
    });
  }, [jsonlPath, config.peekLines]);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color={theme.dim}>peek (last {config.peekLines})</Text>
      <Text color={theme.dim}>{"─".repeat(60)}</Text>
      {loading ? (
        <Text color={theme.dim}>reading transcript…</Text>
      ) : (
        lines.map((line, i) => (
          <Text key={i} color={theme.dim} wrap="truncate">
            {line}
          </Text>
        ))
      )}
    </Box>
  );
}
