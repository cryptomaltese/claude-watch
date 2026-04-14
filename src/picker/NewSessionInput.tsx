import React, { useState } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { theme } from "./theme.js";
import { createNew } from "../core/actions.js";

interface Props {
  onBack: () => void;
}

export function NewSessionInput({ onBack }: Props): React.ReactElement {
  const [path, setPath] = useState("~/");
  const [status, setStatus] = useState<"input" | "working" | "done">("input");
  const [resultMsg, setResultMsg] = useState("");
  const { exit } = useApp();

  function resolvePath(p: string): string {
    if (p.startsWith("~/")) return p.replace("~", process.env.HOME ?? "/root");
    return p.startsWith("/") ? p : `${process.cwd()}/${p}`;
  }

  async function doCreate(attach: boolean): Promise<void> {
    const resolved = resolvePath(path);
    setStatus("working");
    try {
      await createNew({ cwd: resolved, attach, remoteControl: true });
      setResultMsg(`✓ created ${resolved}`);
      setStatus("done");
      setTimeout(() => { if (attach) exit(); else onBack(); }, 500);
    } catch (err) {
      setResultMsg(`✗ ${err instanceof Error ? err.message : "unknown error"}`);
      setStatus("input");
    }
  }

  useInput((input, key) => {
    if (status !== "input") return;
    if (key.escape) { onBack(); }
    else if (key.return && key.ctrl) { doCreate(true); }
    else if (key.return) { doCreate(false); }
    else if (key.backspace || key.delete) { setPath((p) => p.slice(0, -1)); }
    else if (input && !key.ctrl && !key.meta) { setPath((p) => p + input); }
  });

  return (
    <Box flexDirection="column" borderStyle={theme.border} paddingX={1} paddingY={1}>
      <Text color={theme.fg} bold>new watched session</Text>
      <Box marginTop={1}>
        <Text color={theme.dim}>directory › </Text>
        <Text color={theme.fg}>{path}</Text>
        {status === "input" && <Text color={theme.dim}>_</Text>}
      </Box>
      <Box marginTop={1}>
        <Text color={theme.dim}>Directory will be created if it doesn't exist.</Text>
      </Box>
      {status === "working" && <Box marginTop={1}><Text color={theme.accent}>⠋ creating…</Text></Box>}
      {status === "done" && <Box marginTop={1}><Text color={theme.accent}>{resultMsg}</Text></Box>}
      {status === "input" && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.fg}>↵   create + activate</Text>
          <Text color={theme.fg}>^↵  create + activate + attach</Text>
          <Text color={theme.dim}>esc cancel</Text>
        </Box>
      )}
    </Box>
  );
}
