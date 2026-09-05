import { Argument, Command, Flag } from "effect/unstable/cli";
import { previewFlag, yesFlag } from "../../../cli-flags/index.js";
import { withArgvTracking } from "../../../cli-runtime/index.js";
import { withRuntime, withWorkspace } from "../../../runtime.js";
import { scopeFlag } from "../../../cli-flags/scope-flag.js";
import { handleDisableSubagent } from "./handler.js";

const disableConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the subagent to disable")),
  scope: scopeFlag.pipe(
    Flag.withDescription("Disable in project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Disable without confirmation")),
  preview: previewFlag.pipe(Flag.withDescription("Show what would change without disabling")),
} as const;

export const disableCommand = Command.make(
  "disable",
  disableConfig,
  ({ name, scope, yes, preview }) =>
    handleDisableSubagent({ name, yes, preview }).pipe(
      withWorkspace(scope),
      withRuntime("subagents disable"),
    ),
).pipe(
  withArgvTracking(disableConfig),
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
