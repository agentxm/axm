/**
 * Enable command definition for `axm subagents enable`.
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
import { handleEnableSubagent } from "./handler.js";

// -----------------------------------------------------------------------------
// Command
// -----------------------------------------------------------------------------

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
const commandMeta = registryCommandMeta("subagents enable", { json: true });

export const enableCommand = Command.make(
  "enable",
  enableConfig,
  ({ name, scope, yes, force, preview }) =>
    handleEnableSubagent({ name, yes, force, preview }).pipe(
      withWorkspace(scope),
      withCommandRuntime(commandMeta),
    ),
).pipe(
  withArgvTracking(enableConfig),
  annotateCommandMeta(commandMeta),
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
    { command: "", description: "See also: subagents disable, subagents list" },
  ]),
);
