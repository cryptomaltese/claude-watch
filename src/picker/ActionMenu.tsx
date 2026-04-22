import React, { useState } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { theme } from "./theme.js";
import type { Session } from "../core/sessions.js";
import { activate, deactivate, refresh } from "../core/actions.js";
import { PeekPanel } from "./PeekPanel.js";
import { basename } from "node:path";

interface Props {
  session: Session;
  onBack: () => void;
}

type ActionKind = "primary" | "refresh";

interface MenuAction {
  label: string;
  attach: boolean;
  kind: ActionKind;
}

export function ActionMenu({ session, onBack }: Props): React.ReactElement {
  const [status, setStatus] = useState<"idle" | "working" | "done">("idle");
  const [resultMsg, setResultMsg] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const { exit } = useApp();

  const name = session.cwd ? basename(session.cwd) : session.slug;
  const stateLabel = session.isWatched ? "ON" : "OFF";
  const primaryLabel = session.isWatched ? "deactivate" : "activate";
  const canRefresh = Boolean(session.isAlive && session.jsonlId);

  const actions: MenuAction[] = [
    { label: primaryLabel, attach: false, kind: "primary" },
    { label: `${primaryLabel} + attach`, attach: true, kind: "primary" },
    ...(canRefresh
      ? [
          { label: "refresh (restart claude)", attach: false, kind: "refresh" as const },
          { label: "refresh + attach", attach: true, kind: "refresh" as const },
        ]
      : []),
  ];

  async function runAction(action: MenuAction): Promise<void> {
    if (!session.cwd) return;
    setStatus("working");
    try {
      if (action.kind === "refresh") {
        await refresh({ cwd: session.cwd, jsonlId: session.jsonlId, attach: action.attach });
        setResultMsg(action.attach ? "✓ refreshed — attaching" : "✓ refreshed");
      } else if (session.isWatched) {
        await deactivate({ cwd: session.cwd, kill: !action.attach, attach: action.attach });
        setResultMsg(action.attach ? "✓ deactivated — attaching" : "✓ deactivated");
      } else {
        await activate({ cwd: session.cwd, jsonlId: session.jsonlId, attach: action.attach });
        setResultMsg(action.attach ? "✓ activated — attaching" : "✓ activated");
      }
      setStatus("done");
      setTimeout(() => {
        if (action.attach) exit();
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
    } else if (key.upArrow || key.downArrow) {
      // Clear Ink's frame state before the re-render so the incremental
      // diff draws against a known-blank terminal. Otherwise arrow-nav
      // within ActionMenu stacks a ghost panel above the active frame.
      const inkClear = (globalThis as { __claudeWatchInkClear?: () => void }).__claudeWatchInkClear;
      inkClear?.();
      setSelectedIdx((i) =>
        key.upArrow
          ? (i - 1 + actions.length) % actions.length
          : (i + 1) % actions.length
      );
    } else if (key.return) {
      runAction(actions[Math.min(selectedIdx, actions.length - 1)]);
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
            {actions.map((action, idx) => {
              const isSelected = idx === selectedIdx;
              return (
                <Box key={action.label}>
                  <Text color={isSelected ? theme.accent : theme.dim}>
                    {isSelected ? "❯ " : "  "}
                  </Text>
                  <Text
                    color={isSelected ? theme.accent : theme.fg}
                    bold={isSelected}
                  >
                    {action.label}
                  </Text>
                </Box>
              );
            })}
            <Box marginTop={1}>
              <Text color={theme.dim}>↑↓ nav · ↵ select · esc back</Text>
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}
