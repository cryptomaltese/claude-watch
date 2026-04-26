import React, { useState } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { theme } from "./theme.js";

type SelectedAction = "primary" | "secondary";

interface Props {
  title: string;
  primaryLabel: string;
  secondaryLabel: string;
  hint?: string;
  onSubmit: (cwd: string, attach: boolean) => Promise<void>;
  onBack: () => void;
}

export function resolveCwd(p: string): string {
  const expanded = p.startsWith("~/")
    ? p.replace("~", process.env.HOME ?? "/root")
    : p.startsWith("/") ? p : `${process.cwd()}/${p}`;
  // Strip trailing slashes. Without this, a path like ".../trading/"
  // produces empty basename in the picker name column AND is stored in
  // watched.json differently from ".../trading", creating phantom rows.
  return expanded.replace(/\/+$/, "") || "/";
}

export function CwdPrompt({
  title, primaryLabel, secondaryLabel, hint, onSubmit, onBack,
}: Props): React.ReactElement {
  const [path, setPath] = useState(process.cwd() + "/");
  const [status, setStatus] = useState<"input" | "working" | "rc" | "done">("input");
  const [resultMsg, setResultMsg] = useState("");
  const [selected, setSelected] = useState<SelectedAction>("primary");
  const { exit } = useApp();

  async function submit(attach: boolean): Promise<void> {
    const resolved = resolveCwd(path);
    setStatus("working");
    try {
      // When not attaching, bounce to "rc" after tmux is up so the user
      // sees the RC-wait phase (~25-40s). Matches createNew's UX.
      if (!attach) setTimeout(() => setStatus((s) => (s === "working" ? "rc" : s)), 2000);
      await onSubmit(resolved, attach);
      setResultMsg(`✓ ${resolved}`);
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
    if (key.return) { submit(selected === "secondary"); return; }
    if (key.backspace || key.delete) { setPath((p) => p.slice(0, -1)); return; }
    if (input && !key.ctrl && !key.meta) { setPath((p) => p + input); }
  });

  return (
    <Box flexDirection="column" borderStyle={theme.border} paddingX={1} paddingY={1}>
      <Text color={theme.fg} bold>{title}</Text>
      <Box marginTop={1}>
        <Text color={theme.dim}>directory › </Text>
        <Text color={theme.fg}>{path}</Text>
        {status === "input" && <Text color={theme.dim}>_</Text>}
      </Box>
      {hint && (
        <Box marginTop={1}>
          <Text color={theme.dim}>{hint}</Text>
        </Box>
      )}
      {status === "working" && <Box marginTop={1}><Text color={theme.accent}>⠋ working…</Text></Box>}
      {status === "rc" && <Box marginTop={1}><Text color={theme.accent}>⠋ activating remote-control (up to ~40s)…</Text></Box>}
      {status === "done" && <Box marginTop={1}><Text color={theme.accent}>{resultMsg}</Text></Box>}
      {status === "input" && (
        <Box flexDirection="column" marginTop={1}>
          <Box>
            <Text color={selected === "primary" ? theme.accent : theme.dim}>
              {selected === "primary" ? "❯ " : "  "}
            </Text>
            <Text color={selected === "primary" ? theme.accent : theme.fg} bold={selected === "primary"}>
              {primaryLabel}
            </Text>
          </Box>
          <Box>
            <Text color={selected === "secondary" ? theme.accent : theme.dim}>
              {selected === "secondary" ? "❯ " : "  "}
            </Text>
            <Text color={selected === "secondary" ? theme.accent : theme.fg} bold={selected === "secondary"}>
              {secondaryLabel}
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
