import React, { useState } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { theme } from "./theme.js";
import type { Session } from "../core/sessions.js";
import { activate, deactivate } from "../core/actions.js";
import { PeekPanel } from "./PeekPanel.js";
import { basename } from "node:path";

interface Props {
  session: Session;
  onBack: () => void;
}

export function ActionMenu({ session, onBack }: Props): React.ReactElement {
  const [status, setStatus] = useState<"idle" | "working" | "done">("idle");
  const [resultMsg, setResultMsg] = useState("");
  const { exit } = useApp();

  const name = session.cwd ? basename(session.cwd) : session.slug;
  const stateLabel = session.isWatched ? "ON" : "OFF";
  const primaryLabel = session.isWatched ? "deactivate" : "activate";
  const secondaryLabel = session.isWatched
    ? "deactivate + attach"
    : "activate + attach";

  async function doAction(attach: boolean): Promise<void> {
    if (!session.cwd) return;
    setStatus("working");
    try {
      if (session.isWatched) {
        await deactivate({ cwd: session.cwd, kill: !attach, attach });
      } else {
        await activate({ cwd: session.cwd, jsonlId: session.jsonlId, attach });
      }
      setResultMsg(`✓ ${primaryLabel}d`);
      setStatus("done");
      setTimeout(() => {
        if (attach) exit();
        else onBack();
      }, 500);
    } catch (err) {
      setResultMsg(`✗ ${err instanceof Error ? err.message : "unknown error"}`);
      setStatus("idle");
    }
  }

  useInput((input, key) => {
    if (status === "working") return;
    if (key.escape || (key.leftArrow && !key.meta)) {
      onBack();
    } else if (input === "q") {
      exit();
    } else if (key.return && key.ctrl) {
      doAction(true);
    } else if (key.return) {
      doAction(false);
    }
  });

  return (
    <Box flexDirection="column" borderStyle={theme.border} paddingX={1} paddingY={1}>
      <Box>
        <Text color={theme.fg} bold>{name}</Text>
        <Text color={theme.dim}> · </Text>
        <Text color={session.isWatched ? theme.accent : theme.dim}>{stateLabel}</Text>
        <Text color={theme.dim}> · {session.cwd ?? session.slug}</Text>
      </Box>

      <Box marginTop={1}>
        <PeekPanel jsonlPath={session.jsonlPath} />
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text color={theme.dim}>─ actions ─</Text>
        {status === "working" && <Text color={theme.accent}>⠋ working…</Text>}
        {status === "done" && <Text color={theme.accent}>{resultMsg}</Text>}
        {status === "idle" && (
          <>
            <Box marginTop={1}>
              <Text color={theme.fg}>↵   {primaryLabel}</Text>
            </Box>
            <Box>
              <Text color={theme.fg}>^↵  {secondaryLabel}</Text>
            </Box>
            <Box marginTop={1}>
              <Text color={theme.dim}>esc back to list</Text>
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}
