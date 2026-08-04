import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { FilesManager } from "@agentxm/client-core/unstable/files";
import type { FilesLockEntry } from "@agentxm/client-core/unstable/lockfile";
import {
  previewOrApplyPlan,
  type JobStepArtifact,
  type JobStepArtifactTarget,
  type JobStepResult,
  type Plan,
} from "@agentxm/client-core/unstable/plan";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { isWorkspaceSourceLocator } from "@agentxm/client-core/unstable/sources";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { emitAppliedPlanOutcome } from "../shared/applied-plan-output.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";

const filesDisableArtifactTargets = (
  _lockEntry: Option.Option<FilesLockEntry>,
): ReadonlyArray<JobStepArtifactTarget> => [{ path: ".axm/settings.json", change: "updated" }];

const filesDisableArtifact = (args: {
  readonly lockEntry: Option.Option<FilesLockEntry>;
  readonly scope: JobStepArtifact["scope"];
}): JobStepArtifact => ({
  path: ".axm/settings.json",
  scope: args.scope,
  change: "updated",
  targets: filesDisableArtifactTargets(args.lockEntry),
});

export const handleDisableFiles = Effect.fn("DisableFiles.handle")(function* (args: {
  readonly name: string;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}) {
  const ws = yield* WorkspaceMutations;
  const filesManager = yield* FilesManager;
  const scope = ws.scope;
  const configured = yield* ws.getConfiguredFilesEntries();
  const entry = configured[args.name];
  if (entry === undefined) {
    yield* emitNoOpOutcome("files.disable", {
      planName: "Disable files",
      message: `files package "${args.name}" is not configured`,
    });
    return;
  }
  if (!entry.enabled) {
    yield* emitNoOpOutcome("files.disable", {
      planName: "Disable files",
      message: `files package "${args.name}" is already disabled`,
    });
    return;
  }

  const plan: Plan = {
    _tag: "Plan",
    name: "Disable files",
    description: Option.some(`Disable files package ${args.name}`),
    jobs: [
      {
        concurrency: 1,
        steps: [
          {
            readiness: "ready",
            label: args.name,
            run: Effect.gen(function* () {
              const lockEntry = yield* ws
                .getLockedFilesEntry(args.name)
                .pipe(Effect.catch(() => Effect.succeed(Option.none())));
              yield* ws.updateFilesEntry(args.name, (current) => ({
                ...current,
                enabled: false,
              }));
              yield* filesManager.materializeUninstall({
                target: { type: "files", name: args.name },
                preserveSource: isWorkspaceSourceLocator(entry.source),
              });
              return {
                result: "success",
                message: `Disabled ${args.name}`,
                artifact: filesDisableArtifact({ lockEntry, scope }),
              } satisfies JobStepResult;
            }),
          },
        ],
      },
    ],
  };
  const resolution = yield* previewOrApplyPlan(plan, { ...args, displayApplied: false });
  yield* emitAppliedPlanOutcome({
    command: "files.disable",
    headline: `Disabled files package ${args.name}`,
    resolution,
    suggestions: [
      { description: "Inspect installed files packages", cmd: "axm files list" },
      { description: "Undo", cmd: `axm files enable ${args.name}` },
    ],
  });
});

const disableConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the files package")),
  scope: scopeFlag.pipe(
    Flag.withDescription("Disable in project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Disable without confirmation")),
  force: forceFlag.pipe(Flag.withDescription("Disable even if retained dependencies exist")),
  preview: previewFlag.pipe(Flag.withDescription("Show what would change without disabling")),
} as const;

export const disableCommand = Command.make(
  "disable",
  disableConfig,
  ({ name, scope, yes, force, preview }) =>
    handleDisableFiles({ name, yes, force, preview }).pipe(
      withWorkspace(scope),
      withRuntime("files disable"),
    ),
).pipe(
  withArgvTracking(disableConfig),
  Command.withDescription("Disable a files package without removing sync-once targets"),
  Command.withExamples([
    {
      command: "axm files disable workspace-baseline",
      description: "Disable a files package",
    },
  ]),
);
