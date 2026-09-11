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

export const handleEnableRule = (args: { readonly name: string; readonly preview: boolean }) =>
  handleSetActivation(
    { type: "rule", name: args.name, enabled: true, preview: args.preview },
    {
      command: "rules.enable",
      commandPath: ["rules", "enable"],
      planName: "Enable rules",
      suggestions: [
        { description: "Inspect installed rules", cmd: "axm rules list" },
        { description: "Undo", cmd: `axm rules disable ${args.name}` },
      ],
    },
  );

const enableConfig = {
  name: Argument.String("name").pipe(Argument.withDescription("Name of the rule")),
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
    handleEnableRule({ name, preview }).pipe(
      withReleaseAgePosture(ignoreReleaseAge),
      withWorkspace(scope),
      withRuntime("rules enable"),
    ),
).pipe(
  withArgvTracking(enableConfig),
  withCommandCapabilities(previewableCapabilities("workspace")),
  Command.withDescription("Enable a rule"),
  Command.withExamples([
    {
      command: "axm rules enable commit-style",
      description: "Enable a configured rule",
    },
  ]),
);
