/**
 * Disable command definition for `axm subagents disable`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { Argument, Command, Flag } from "effect/unstable/cli";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import {
  annotateCommandMeta,
  registryCommandMeta,
  withCommandRuntime,
} from "../../../command-meta.js";
import { withWorkspace } from "../../../runtime.js";
import { scopeFlag } from "../../../cli-flags.js";
import { handleDisableSubagent } from "./handler.js";

// -----------------------------------------------------------------------------
// Command
// -----------------------------------------------------------------------------

const disableConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the subagent to disable")),
  scope: scopeFlag.pipe(
    Flag.withDescription("Disable in project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Disable without confirmation")),
  force: forceFlag.pipe(Flag.withDescription("Disable even if other subagents depend on it")),
  preview: previewFlag.pipe(Flag.withDescription("Show what would change without disabling")),
} as const;
const commandMeta = registryCommandMeta("subagents disable", { json: true });

export const disableCommand = Command.make(
  "disable",
  disableConfig,
  ({ name, scope, yes, force, preview }) =>
    handleDisableSubagent({ name, yes, force, preview }).pipe(
      withWorkspace(scope),
      withCommandRuntime(commandMeta),
    ),
).pipe(
  withArgvTracking(disableConfig),
  annotateCommandMeta(commandMeta),
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
    { command: "", description: "See also: subagents enable, subagents list" },
  ]),
);
