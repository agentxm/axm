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

export interface DisableHandlerArgs {
  readonly name: string;
  readonly preview: boolean;
}

export const handleDisable = (args: DisableHandlerArgs) =>
  handleSetActivation(
    { type: "skill", name: args.name, enabled: false, preview: args.preview },
    {
      command: "skills.disable",
      commandPath: ["skills", "disable"],
      planName: "Disable skill",
      suggestions: [
        LIST_INSTALLED_SKILLS,
        { description: "Undo", cmd: `axm skills enable ${args.name}` },
      ],
    },
  );

const disableConfig = {
  name: Argument.String("name").pipe(Argument.withDescription("Name of the skill to disable")),
  scope: scopeFlag.pipe(
    Flag.withDescription("Disable in project (default) or user-level configuration"),
  ),
  preview: previewCapabilityFlag("Show what would change without disabling"),
  ignoreReleaseAge: ignoreReleaseAgeFlag,
} as const;

export const disableCommand = Command.make(
  "disable",
  disableConfig,
  ({ name, scope, preview, ignoreReleaseAge }) =>
    handleDisable({ name, preview }).pipe(
      withReleaseAgePosture(ignoreReleaseAge),
      withWorkspace(scope),
      withRuntime("skills disable"),
    ),
).pipe(
  withArgvTracking(disableConfig),
  withCommandCapabilities(previewableCapabilities("workspace")),
  Command.withDescription("Disable a skill without uninstalling it"),
  Command.withExamples([
    {
      command: "axm skills disable code-review",
      description: "Temporarily disable a skill without removing it",
    },
    {
      command: "axm skills disable code-review --scope user",
      description: "Disable for user-scope configuration",
    },
  ]),
);
