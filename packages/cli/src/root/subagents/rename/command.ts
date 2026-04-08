/**
 * Rename command definition for `axm subagents rename`.
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
import { handleRenameSubagent } from "./handler.js";

// -----------------------------------------------------------------------------
// Command
// -----------------------------------------------------------------------------

const renameConfig = {
  oldName: Argument.string("old-name").pipe(
    Argument.withDescription("Current name of the subagent"),
  ),
  newName: Argument.string("new-name").pipe(Argument.withDescription("New name for the subagent")),
  scope: scopeFlag.pipe(
    Flag.withDescription("Rename in project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Rename without confirmation")),
  force: forceFlag.pipe(
    Flag.withDescription("Rename even if the new name conflicts with an existing subagent"),
  ),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what would be renamed without making changes"),
  ),
} as const;
const commandMeta = registryCommandMeta("subagents rename", { json: true });

export const renameCommand = Command.make(
  "rename",
  renameConfig,
  ({ oldName, newName, scope, yes, force, preview }) =>
    handleRenameSubagent({ oldName, newName, yes, force, preview }).pipe(
      withWorkspace(scope),
      withCommandRuntime(commandMeta),
    ),
).pipe(
  withArgvTracking(renameConfig),
  annotateCommandMeta(commandMeta),
  Command.withDescription("Rename a locally-authored subagent"),
  Command.withExamples([
    {
      command: "axm subagents rename old-name new-name",
      description: "Give a subagent a better name",
    },
    {
      command: "axm subagents rename old-name new-name --preview",
      description: "Check what would change first",
    },
    { command: "", description: "See also: subagents list, subagents disable" },
  ]),
);
