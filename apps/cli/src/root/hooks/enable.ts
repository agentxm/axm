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

export const handleEnableHook = (args: { readonly name: string; readonly preview: boolean }) =>
  handleSetActivation(
    { type: "hook", name: args.name, enabled: true, preview: args.preview },
    {
      command: "hooks.enable",
      commandPath: ["hooks", "enable"],
      planName: "Enable hooks",
      suggestions: [
        { description: "Inspect installed hooks packages", cmd: "axm hooks list" },
        { description: "Undo", cmd: `axm hooks disable ${args.name}` },
      ],
    },
  );

const enableConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the hooks package")),
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
    handleEnableHook({ name, preview }).pipe(
      withReleaseAgePosture(ignoreReleaseAge),
      withWorkspace(scope),
      withRuntime("hooks enable"),
    ),
).pipe(
  withArgvTracking(enableConfig),
  withCommandCapabilities(previewableCapabilities("workspace")),
  Command.withDescription("Enable a hooks package"),
  Command.withExamples([
    {
      command: "axm hooks enable workspace-baseline",
      description: "Enable a configured hooks package",
    },
  ]),
);
