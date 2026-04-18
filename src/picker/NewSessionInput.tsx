import React, { useState } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { theme } from "./theme.js";
import { createNew } from "../core/actions.js";

interface Props {
  onBack: () => void;
}

type SelectedAction = "primary" | "secondary";

export function NewSessionInput({ onBack }: Props): React.ReactElement {
  // Default to the picker process's cwd, not ~/ — matches user intent when
  // they launch claude-watch from a project dir.
  const [path, setPath] = useState(process.cwd() + "/");
  const [status, setStatus] = useState<"input" | "working" | "rc" | "done">("input");
  const [resultMsg, setResultMsg] = useState("");
  const [selected, setSelected] = useState<SelectedAction>("primary");
  const { exit } = useApp();

  function resolvePath(p: string): string {
    if (p.startsWith("~/")) return p.replace("~", process.env.HOME ?? "/root");
    return p.startsWith("/") ? p : `${process.cwd()}/${p}`;
  }

  async function doCreate(attach: boolean): Promise<void> {
    const resolved = resolvePath(path);
    setStatus("working");
    try {
      // When not attaching, we want RC to be active by the time createNew
      // returns so the session appears in Desktop immediately. The wait is
      // ~25-40s (claude needs to finish loading before /remote-control sticks).
      // While createNew runs, we bounce status from "working" to "rc" after
      // the tmux is up to signal the RC-wait phase to the user.
      if (!attach) setTimeout(() => setStatus((s) => (s === "working" ? "rc" : s)), 2000);
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
    if (key.escape) { onBack(); return; }
    if (key.upArrow || key.downArrow) {
      setSelected((s) => (s === "primary" ? "secondary" : "primary"));
      return;
    }
    if (key.return) { doCreate(selected === "secondary"); return; }
    if (key.backspace || key.delete) { setPath((p) => p.slice(0, -1)); return; }
    if (input && !key.ctrl && !key.meta) { setPath((p) => p + input); }
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
      {status === "working" && <Box marginTop={1}><Text color={theme.accent}>⠋ creating tmux + claude…</Text></Box>}
      {status === "rc" && <Box marginTop={1}><Text color={theme.accent}>⠋ activating remote-control (up to ~40s)…</Text></Box>}
      {status === "done" && <Box marginTop={1}><Text color={theme.accent}>{resultMsg}</Text></Box>}
      {status === "input" && (
        <Box flexDirection="column" marginTop={1}>
          <Box>
            <Text color={selected === "primary" ? theme.accent : theme.dim}>
              {selected === "primary" ? "❯ " : "  "}
            </Text>
            <Text color={selected === "primary" ? theme.accent : theme.fg} bold={selected === "primary"}>
              create + activate
            </Text>
          </Box>
          <Box>
            <Text color={selected === "secondary" ? theme.accent : theme.dim}>
              {selected === "secondary" ? "❯ " : "  "}
            </Text>
            <Text color={selected === "secondary" ? theme.accent : theme.fg} bold={selected === "secondary"}>
              create + activate + attach
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text color={theme.dim}>↑↓ nav · ↵ select · esc cancel</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
