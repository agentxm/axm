import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { ignoreReleaseAgeFlag, previewFlag, yesFlag } from "../../cli-flags/index.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withReleaseAgePosture, withRuntime, withWorkspace } from "../../runtime.js";
import { resolveWorkspaceUpdateSelection, updateNameFilterFlag } from "../shared/update-targets.js";
import { handleWorkspaceUpdate } from "../update/workspace-update-handler.js";

const COMMAND = "hooks.update";
const PLAN_NAME = "Update hooks";
const PLAN_DESCRIPTION = "Update configured hooks packages";

const updateConfig = {
  source: Argument.string("source").pipe(
    Argument.withDescription("Filter to hooks packages matching a name or source"),
    Argument.optional,
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Update in project (default) or user-level configuration"),
  ),
  name: updateNameFilterFlag.pipe(
    Flag.withDescription("Update only specific hooks packages by name or glob pattern"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Apply updates without confirmation")),
  preview: previewFlag.pipe(Flag.withDescription("Show what would change without updating")),
  ignoreReleaseAge: ignoreReleaseAgeFlag,
} as const;

export const updateCommand = Command.make(
  "update",
  updateConfig,
  ({ source, scope, name, yes, preview, ignoreReleaseAge }) =>
    Effect.gen(function* () {
      const selection = yield* resolveWorkspaceUpdateSelection({
        command: COMMAND,
        planName: PLAN_NAME,
        planDescription: PLAN_DESCRIPTION,
        resourceType: "hook",
        resourceLabel: "hook",
        resourceLabelPlural: "hooks",
        source,
        nameFilters: name,
      });
      if (selection.type === "no-op") return;

      yield* handleWorkspaceUpdate({
        command: COMMAND,
        type: Option.some("hook"),
        planName: PLAN_NAME,
        planDescription: Option.some(PLAN_DESCRIPTION),
        flags: { yes, preview },
        ...(selection.type === "names" ? { names: selection.names } : {}),
      });
    }).pipe(
      withReleaseAgePosture(ignoreReleaseAge),
      withWorkspace(scope),
      withRuntime("hooks update"),
    ),
).pipe(
  withArgvTracking(updateConfig),
  Command.withDescription("Update configured hooks packages"),
  Command.withExamples([
    {
      command: "axm hooks update",
      description: "Update configured hooks packages",
    },
    {
      command: "axm hooks update --name workspace-*",
      description: "Update only hooks packages matching a glob",
    },
  ]),
);
