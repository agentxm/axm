import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";
import { isNonInteractive, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { CliPrompt } from "@axm.sh/core/unstable/cli-prompt";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import {
  applyPlan,
  displayPlan,
  getWorkspaceLockfileSyncReadiness,
  scanPlanReadiness,
  syncWorkspaceLockfile,
  type JobStepResult,
  type Plan,
  type PlanResolution,
  type PlannedJobStep,
  Workspace,
} from "@axm.sh/core/unstable/workspace";
import { makeAppError } from "@axm.sh/core/unstable/app-error";
import { annotateCommandMeta, registryCommandMeta, withCommandRuntime } from "../command-meta.js";
import { emitPlanResolutionResult } from "../json-output.js";
import { scopeFlag } from "../cli-flags.js";
import { withWorkspace } from "../runtime.js";

export interface SyncHandlerArgs {
  readonly yes: boolean;
  readonly preview: boolean;
}

const formatEntryCount = (entryCount: number) =>
  entryCount === 1 ? "1 entry" : `${entryCount} entries`;

const makeSyncPlan = (step: PlannedJobStep): Plan => ({
  _tag: "Plan",
  name: "Sync workspace",
  description: Option.some("Synchronize managed workspace state from settings.json"),
  jobs: [{ concurrency: 1 as const, steps: [step] }],
});

const resolveSyncPlan = Effect.fn("Sync.resolvePlan")(function* (
  plan: Plan,
  args: SyncHandlerArgs,
) {
  const renderer = yield* CliRenderer;
  const prompt = yield* CliPrompt;
  const nonInteractive = yield* isNonInteractive;
  const resolvedYes = args.yes || nonInteractive;
  const readiness = scanPlanReadiness(plan);

  if (readiness.hasErrors) {
    yield* displayPlan(plan);
    return yield* makeAppError({
      code: "WORKSPACE_SYNC_BLOCKED",
      what: "Cannot sync workspace while declarations are unresolved",
      details: readiness.errorMessages,
      howToFix: "Restore the missing extension files or remove the stale settings entries first.",
    });
  }

  if (args.preview) {
    yield* renderer.info("Previewing changes...");
    yield* displayPlan(plan);

    if (nonInteractive && !args.yes) {
      return {
        _tag: "PreviewedPlan",
        name: plan.name,
        description: plan.description,
        jobs: plan.jobs,
      } satisfies PlanResolution;
    }

    if (!resolvedYes) {
      const confirmed = yield* prompt.confirm({ message: "Apply changes?" });
      if (!confirmed) {
        yield* renderer.success("Cancelled.");
        return {
          _tag: "CancelledPlan",
          name: plan.name,
          description: plan.description,
          jobs: plan.jobs,
        } satisfies PlanResolution;
      }
    }
  }

  const executed = yield* applyPlan(plan);
  yield* displayPlan(executed);
  return executed;
});

export const handleSync = Effect.fn("Sync.handle")(function* (args: SyncHandlerArgs) {
  const renderer = yield* CliRenderer;
  const ws = yield* Workspace;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const syncReadiness = yield* getWorkspaceLockfileSyncReadiness();

  const step: PlannedJobStep = syncReadiness.canSync
    ? {
        readiness: "ready",
        label: "axm-lock.yaml",
        run: syncWorkspaceLockfile().pipe(
          Effect.map(
            (entryCount): JobStepResult => ({
              result: "success",
              message: `Synchronized axm-lock.yaml (${formatEntryCount(entryCount)})`,
            }),
          ),
          Effect.provideService(Workspace, ws),
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path),
        ),
      }
    : {
        readiness: "error",
        label: "axm-lock.yaml",
        errorMessage: `Cannot synchronize while ${syncReadiness.unresolvedCount} declaration(s) are unresolved.`,
      };

  const plan = makeSyncPlan(step);

  yield* renderer.info("axm sync");

  const resolution = yield* resolveSyncPlan(plan, args);
  yield* emitPlanResolutionResult("sync", resolution);

  if (resolution._tag === "ExecutedPlan") {
    yield* renderer.success("Done");
  }
});

const syncConfig = {
  scope: scopeFlag.pipe(Flag.withDescription("Sync the project (default) or user-level workspace")),
  yes: yesFlag.pipe(Flag.withDescription("Apply previewed sync changes without prompting")),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what would be synchronized without modifying the workspace"),
  ),
} as const;

const commandMeta = registryCommandMeta("sync", { json: true });

export const syncCommand = Command.make("sync", syncConfig, ({ scope, yes, preview }) =>
  handleSync({ yes, preview }).pipe(withWorkspace(scope), withCommandRuntime(commandMeta)),
).pipe(
  withArgvTracking(syncConfig),
  annotateCommandMeta(commandMeta),
  Command.withDescription("Synchronize managed workspace state from settings.json"),
  Command.withExamples([
    { command: "axm sync", description: "Synchronize managed workspace state from settings.json" },
    { command: "axm sync --preview", description: "Preview workspace synchronization" },
  ]),
);
