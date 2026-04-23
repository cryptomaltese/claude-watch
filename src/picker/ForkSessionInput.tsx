import React from "react";
import { CwdPrompt } from "./CwdPrompt.js";
import { fork } from "../core/actions.js";
import type { Session } from "../core/sessions.js";

interface Props {
  session: Session;
  onBack: () => void;
}

export function ForkSessionInput({ session, onBack }: Props): React.ReactElement {
  return (
    <CwdPrompt
      title={`fork session · source: ${session.cwd ?? session.slug}`}
      primaryLabel="fork"
      secondaryLabel="fork + attach"
      hint="Fork into a new directory. Source session stays untouched."
      onSubmit={async (cwd, attach) => {
        await fork({
          cwd,
          srcJsonlPath: session.jsonlPath,
          srcJsonlId: session.jsonlId,
          attach,
          remoteControl: true,
        });
      }}
      onBack={onBack}
    />
  );
}
