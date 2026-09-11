import { Argument, Command, Flag } from "effect/unstable/cli";

import { ignoreReleaseAgeFlag } from "../../cli-flags/index.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withReleaseAgePosture, withRuntime, withWorkspace } from "../../runtime.js";
import { handleSetActivation } from "../activation-handler.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";
import { LIST_INSTALLED_SKILLS } from "../suggested-actions.js";

export interface EnableHandlerArgs {
  readonly name: string;
  readonly preview: boolean;
}

export const handleEnable = (args: EnableHandlerArgs) =>
  handleSetActivation(
    { type: "skill", name: args.name, enabled: true, preview: args.preview },
    {
      command: "skills.enable",
      commandPath: ["skills", "enable"],
      planName: "Enable skill",
      suggestions: [
        LIST_INSTALLED_SKILLS,
        { description: "Undo", cmd: `axm skills disable ${args.name}` },
      ],
    },
  );

const enableConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the skill to enable")),
  scope: scopeFlag.pipe(
    Flag.withDescription("Enable in project (default) or user-level configuration"),
  ),
  preview: previewCapabilityFlag("Show what would change without enabling"),
  ignoreReleaseAge: ignoreReleaseAgeFlag,
} as const;

export const enableCommand = Command.make(
  "enable",
  enableConfig,
  ({ name, scope, preview, ignoreReleaseAge }) =>
    handleEnable({ name, preview }).pipe(
      withReleaseAgePosture(ignoreReleaseAge),
      withWorkspace(scope),
      withRuntime("skills enable"),
    ),
).pipe(
  withArgvTracking(enableConfig),
  withCommandCapabilities(previewableCapabilities("workspace")),
  Command.withDescription("Enable a previously disabled skill"),
  Command.withExamples([
    {
      command: "axm skills enable code-review",
      description: "Re-enable a skill you previously disabled",
    },
    {
      command: "axm skills enable code-review --preview",
      description: "Preview the change before enabling",
    },
  ]),
);
