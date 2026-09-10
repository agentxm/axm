import { Argument, Command, Flag } from "effect/unstable/cli";
import { withArgvTracking } from "../../../cli-runtime/index.js";
import { withRuntime, withWorkspace } from "../../../runtime.js";
import { scopeFlag } from "../../../cli-flags/scope-flag.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../../shared/command-capabilities.js";
import { handleDisableSubagent } from "./handler.js";

const disableConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the subagent to disable")),
  scope: scopeFlag.pipe(
    Flag.withDescription("Disable in project (default) or user-level configuration"),
  ),
  preview: previewCapabilityFlag("Show what would change without disabling"),
} as const;

export const disableCommand = Command.make("disable", disableConfig, ({ name, scope, preview }) =>
  handleDisableSubagent({ name, preview }).pipe(
    withWorkspace(scope),
    withRuntime("subagents disable"),
  ),
).pipe(
  withArgvTracking(disableConfig),
  withCommandCapabilities(previewableCapabilities("workspace")),
  Command.withDescription("Disable an installed subagent without removing it"),
  Command.withExamples([
    {
      command: "axm subagents disable researcher",
      description: "Temporarily disable a subagent without removing it",
    },
    {
      command: "axm subagents disable researcher --scope user",
      description: "Disable for user-scope configuration",
    },
  ]),
);
