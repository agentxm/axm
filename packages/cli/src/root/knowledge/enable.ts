import { Command } from "effect/unstable/cli";

import { withArgvTracking } from "@agentxm/extension-management/unstable/cli-runtime";

import { withRuntime, withWorkspace } from "../../runtime.js";
import { activationConfig, setKnowledgeEnabled } from "./activation.js";

export const enableCommand = Command.make("enable", activationConfig, ({ name, scope, preview }) =>
  setKnowledgeEnabled(name, true, preview).pipe(
    withWorkspace(scope),
    withRuntime("knowledge enable"),
  ),
).pipe(
  withArgvTracking(activationConfig),
  Command.withDescription("Include a knowledge bundle in discovery"),
  Command.withExamples([
    {
      command: "axm knowledge enable platform",
      description: "Restore a bundle to discovery and search",
    },
  ]),
);
