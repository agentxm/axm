import * as Effect from "effect/Effect";
import { Command } from "effect/unstable/cli";

import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { KnowledgeManagerLive } from "@agentxm/client-core/unstable/knowledge";

import { withRuntime, withWorkspace } from "../../runtime.js";
import { activationConfig, setKnowledgeEnabled } from "./activation.js";

export const enableCommand = Command.make("enable", activationConfig, ({ name, scope, preview }) =>
  setKnowledgeEnabled(name, true, preview).pipe(
    Effect.provide(KnowledgeManagerLive),
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
