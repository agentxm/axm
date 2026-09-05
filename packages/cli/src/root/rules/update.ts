import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { ignoreReleaseAgeFlag, previewFlag, yesFlag } from "../../cli-flags/index.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withReleaseAgePosture, withRuntime, withWorkspace } from "../../runtime.js";
import { resolveWorkspaceUpdateSelection, updateNameFilterFlag } from "../shared/update-targets.js";
import { handleWorkspaceUpdate } from "../update/workspace-update-handler.js";

const COMMAND = "rules.update";
const PLAN_NAME = "Update rules";
const PLAN_DESCRIPTION = "Update configured rules";

const updateConfig = {
  source: Argument.string("source").pipe(
    Argument.withDescription("Filter to rules matching a name or source"),
    Argument.optional,
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Update in project (default) or user-level configuration"),
  ),
  name: updateNameFilterFlag.pipe(
    Flag.withDescription("Update only specific rules by name or glob pattern"),
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
        resourceType: "rule",
        resourceLabel: "rule",
        resourceLabelPlural: "rules",
        source,
        nameFilters: name,
      });
      if (selection.type === "no-op") return;

      yield* handleWorkspaceUpdate({
        command: COMMAND,
        type: Option.some("rule"),
        planName: PLAN_NAME,
        planDescription: Option.some(PLAN_DESCRIPTION),
        flags: { yes, preview },
        ...(selection.type === "names" ? { names: selection.names } : {}),
      });
    }).pipe(
      withReleaseAgePosture(ignoreReleaseAge),
      withWorkspace(scope),
      withRuntime("rules update"),
    ),
).pipe(
  withArgvTracking(updateConfig),
  Command.withDescription("Update configured rules"),
  Command.withExamples([
    {
      command: "axm rules update",
      description: "Update configured rules",
    },
    {
      command: "axm rules update --name commit-*",
      description: "Update only rules matching a glob",
    },
  ]),
);
