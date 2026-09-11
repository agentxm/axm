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

export const handleDisableHook = (args: { readonly name: string; readonly preview: boolean }) =>
  handleSetActivation(
    { type: "hook", name: args.name, enabled: false, preview: args.preview },
    {
      command: "hooks.disable",
      commandPath: ["hooks", "disable"],
      planName: "Disable hooks",
      suggestions: [
        { description: "Inspect installed hooks packages", cmd: "axm hooks list" },
        { description: "Undo", cmd: `axm hooks enable ${args.name}` },
      ],
    },
  );

const disableConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the hooks package")),
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
    handleDisableHook({ name, preview }).pipe(
      withReleaseAgePosture(ignoreReleaseAge),
      withWorkspace(scope),
      withRuntime("hooks disable"),
    ),
).pipe(
  withArgvTracking(disableConfig),
  withCommandCapabilities(previewableCapabilities("workspace")),
  Command.withDescription("Disable a hooks package without removing sync-once targets"),
  Command.withExamples([
    {
      command: "axm hooks disable workspace-baseline",
      description: "Disable a hooks package",
    },
  ]),
);
