import { Argument, Command, Flag } from "effect/unstable/cli";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { withRuntime, withWorkspace } from "../../../runtime.js";
import { scopeFlag } from "../../../cli-flags.js";
import { handleEnableSubagent } from "./handler.js";

const enableConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the subagent to enable")),
  scope: scopeFlag.pipe(
    Flag.withDescription("Enable in project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Enable without confirmation")),
  force: forceFlag.pipe(
    Flag.withDescription("Enable even if the subagent has unresolved dependencies"),
  ),
  preview: previewFlag.pipe(Flag.withDescription("Show what would change without enabling")),
} as const;

export const enableCommand = Command.make(
  "enable",
  enableConfig,
  ({ name, scope, yes, force, preview }) =>
    handleEnableSubagent({ name, yes, force, preview }).pipe(
      withWorkspace(scope),
      withRuntime("subagents enable"),
    ),
).pipe(
  withArgvTracking(enableConfig),
  Command.withDescription("Enable a previously disabled subagent"),
  Command.withExamples([
    {
      command: "axm subagents enable researcher",
      description: "Re-enable a subagent you previously disabled",
    },
    {
      command: "axm subagents enable researcher --preview",
      description: "Preview the change before enabling",
    },
  ]),
);
