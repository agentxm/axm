import { Command } from "effect/unstable/cli";

import { withArgvTracking } from "@agentxm/extension-management/unstable/cli-runtime";

import { withRuntime, withWorkspace } from "../../runtime.js";
import { activationConfig, setKnowledgeEnabled } from "./activation.js";

export const disableCommand = Command.make(
  "disable",
  activationConfig,
  ({ name, scope, preview }) =>
    setKnowledgeEnabled(name, false, preview).pipe(
      withWorkspace(scope),
      withRuntime("knowledge disable"),
    ),
).pipe(
  withArgvTracking(activationConfig),
  Command.withDescription("Exclude a knowledge bundle from discovery while keeping it installed"),
  Command.withExamples([
    {
      command: "axm knowledge disable platform",
      description: "Keep a bundle installed but exclude it from discovery",
    },
  ]),
);
