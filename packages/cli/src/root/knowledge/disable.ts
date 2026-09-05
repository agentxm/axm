import { Command } from "effect/unstable/cli";

import { withArgvTracking } from "../../cli-runtime/index.js";

import { withReleaseAgePosture, withRuntime, withWorkspace } from "../../runtime.js";
import {
  previewableCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";
import { activationConfig, setKnowledgeEnabled } from "./activation.js";

export const disableCommand = Command.make(
  "disable",
  activationConfig,
  ({ name, scope, preview, ignoreReleaseAge }) =>
    setKnowledgeEnabled(name, false, preview).pipe(
      withReleaseAgePosture(ignoreReleaseAge),
      withWorkspace(scope),
      withRuntime("knowledge disable"),
    ),
).pipe(
  withArgvTracking(activationConfig),
  withCommandCapabilities(previewableCapabilities("workspace")),
  Command.withDescription("Exclude a knowledge bundle from discovery while keeping it installed"),
  Command.withExamples([
    {
      command: "axm knowledge disable platform",
      description: "Keep a bundle installed but exclude it from discovery",
    },
  ]),
);
