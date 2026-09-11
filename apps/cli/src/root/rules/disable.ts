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

export const handleDisableRule = (args: { readonly name: string; readonly preview: boolean }) =>
  handleSetActivation(
    { type: "rule", name: args.name, enabled: false, preview: args.preview },
    {
      command: "rules.disable",
      commandPath: ["rules", "disable"],
      planName: "Disable rules",
      suggestions: [
        { description: "Inspect installed rules", cmd: "axm rules list" },
        { description: "Undo", cmd: `axm rules enable ${args.name}` },
      ],
    },
  );

const disableConfig = {
  name: Argument.String("name").pipe(Argument.withDescription("Name of the rule")),
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
    handleDisableRule({ name, preview }).pipe(
      withReleaseAgePosture(ignoreReleaseAge),
      withWorkspace(scope),
      withRuntime("rules disable"),
    ),
).pipe(
  withArgvTracking(disableConfig),
  withCommandCapabilities(previewableCapabilities("workspace")),
  Command.withDescription("Disable a rule without uninstalling it"),
  Command.withExamples([
    {
      command: "axm rules disable commit-style",
      description: "Disable a configured rule",
    },
  ]),
);
