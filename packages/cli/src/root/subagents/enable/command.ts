import { Argument, Command, Flag } from "effect/unstable/cli";
import { previewFlag, yesFlag } from "../../../cli-flags/index.js";
import { withArgvTracking } from "../../../cli-runtime/index.js";
import { withRuntime, withWorkspace } from "../../../runtime.js";
import { scopeFlag } from "../../../cli-flags/scope-flag.js";
import { handleEnableSubagent } from "./handler.js";

const enableConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the subagent to enable")),
  scope: scopeFlag.pipe(
    Flag.withDescription("Enable in project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Enable without confirmation")),
  preview: previewFlag.pipe(Flag.withDescription("Show what would change without enabling")),
} as const;

export const enableCommand = Command.make("enable", enableConfig, ({ name, scope, yes, preview }) =>
  handleEnableSubagent({ name, yes, preview }).pipe(
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
