import { Argument, Command, Flag } from "effect/unstable/cli";
import { withArgvTracking } from "../../../cli-runtime/index.js";
import { withRuntime, withWorkspace } from "../../../runtime.js";
import { scopeFlag } from "../../../cli-flags/scope-flag.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../../shared/command-capabilities.js";
import { handleEnableSubagent } from "./handler.js";

const enableConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the subagent to enable")),
  scope: scopeFlag.pipe(
    Flag.withDescription("Enable in project (default) or user-level configuration"),
  ),
  preview: previewCapabilityFlag("Show what would change without enabling"),
} as const;

export const enableCommand = Command.make("enable", enableConfig, ({ name, scope, preview }) =>
  handleEnableSubagent({ name, preview }).pipe(
    withWorkspace(scope),
    withRuntime("subagents enable"),
  ),
).pipe(
  withArgvTracking(enableConfig),
  withCommandCapabilities(previewableCapabilities("workspace")),
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
