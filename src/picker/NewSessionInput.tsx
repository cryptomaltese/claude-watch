import React from "react";
import { CwdPrompt } from "./CwdPrompt.js";
import { createNew } from "../core/actions.js";

interface Props {
  onBack: () => void;
}

export function NewSessionInput({ onBack }: Props): React.ReactElement {
  return (
    <CwdPrompt
      title="new watched session"
      primaryLabel="create + activate"
      secondaryLabel="create + activate + attach"
      hint="Directory will be created if it doesn't exist."
      onSubmit={async (cwd, attach) => {
        await createNew({ cwd, attach, remoteControl: true });
      }}
      onBack={onBack}
    />
  );
}
