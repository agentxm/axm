import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { resolveWorkspaceUpdateSelection, updateNameFilterFlag } from "../shared/update-targets.js";
import { handleWorkspaceUpdate } from "../update/workspace-update-handler.js";

const COMMAND = "files.update";
const PLAN_NAME = "Update files";
const PLAN_DESCRIPTION = "Update configured files packages";

const updateConfig = {
  source: Argument.string("source").pipe(
    Argument.withDescription("Filter to context files matching a name or source"),
    Argument.optional,
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Update in project (default) or user-level configuration"),
  ),
  name: updateNameFilterFlag.pipe(
    Flag.withDescription("Update only specific context files by name or glob pattern"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Apply updates without confirmation")),
  preview: previewFlag.pipe(Flag.withDescription("Show what would change without updating")),
} as const;

export const updateCommand = Command.make(
  "update",
  updateConfig,
  ({ source, scope, name, yes, preview }) =>
    Effect.gen(function* () {
      const selection = yield* resolveWorkspaceUpdateSelection({
        command: COMMAND,
        planName: PLAN_NAME,
        planDescription: PLAN_DESCRIPTION,
        resourceType: "files",
        resourceLabel: "context files",
        resourceLabelPlural: "context files",
        source,
        nameFilters: name,
      });
      if (selection.type === "no-op") return;

      yield* handleWorkspaceUpdate({
        command: COMMAND,
        type: Option.some("files"),
        planName: PLAN_NAME,
        planDescription: Option.some(PLAN_DESCRIPTION),
        flags: { yes, preview },
        ...(selection.type === "names" ? { names: selection.names } : {}),
      });
    }).pipe(withWorkspace(scope), withRuntime("files update")),
).pipe(
  withArgvTracking(updateConfig),
  Command.withDescription("Update configured files packages"),
  Command.withExamples([
    {
      command: "axm files update",
      description: "Update configured files packages",
    },
    {
      command: "axm files update --name docs-*",
      description: "Update only context files matching a glob",
    },
  ]),
);
