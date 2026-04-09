import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";
import { CodingAgentRepository } from "@axm.sh/core/unstable/agents";
import { previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { SourceHostProviders } from "@axm.sh/core/unstable/source-resolution";
import {
  getWorkspaceSyncReadiness,
  syncWorkspace,
  type JobStepResult,
  type Plan,
  type PlannedJobStep,
  previewOrApplyPlan,
  Workspace,
} from "@axm.sh/core/unstable/workspace";

import { emitPlanResolutionResult } from "../json-output.js";
import { scopeFlag } from "../cli-flags.js";
import { withRuntime, withWorkspace } from "../runtime.js";

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

export const handleSync = Effect.fn("Sync.handle")(function* (args: SyncHandlerArgs) {
  const renderer = yield* CliRenderer;
  const ws = yield* Workspace;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const sources = yield* SourceHostProviders;
  const agentRepo = yield* CodingAgentRepository;
  const syncReadiness = yield* getWorkspaceSyncReadiness();

  const step: PlannedJobStep = syncReadiness.canSync
    ? {
        readiness: "ready",
        label: "Managed skills and axm-lock.yaml",
        run: syncWorkspace().pipe(
          Effect.map(
            (entryCount): JobStepResult => ({
              result: "success",
              message: `Synchronized managed workspace state (${formatEntryCount(entryCount)} in axm-lock.yaml)`,
            }),
          ),
          Effect.provideService(Workspace, ws),
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path),
          Effect.provideService(SourceHostProviders, sources),
          Effect.provideService(CodingAgentRepository, agentRepo),
        ),
      }
    : {
        readiness: "error",
        label: "Managed skills and axm-lock.yaml",
        errorMessage: `Cannot synchronize while ${syncReadiness.unresolvedCount} skill declaration(s) are unresolved.`,
      };

  const plan = makeSyncPlan(step);

  yield* renderer.info("axm sync");

  const resolution = yield* previewOrApplyPlan(plan, {
    yes: args.yes,
    force: false,
    preview: args.preview,
  });
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

export const syncCommand = Command.make("sync", syncConfig, ({ scope, yes, preview }) =>
  handleSync({ yes, preview }).pipe(withWorkspace(scope), withRuntime("sync")),
).pipe(
  withArgvTracking(syncConfig),
  Command.withDescription("Synchronize managed workspace state from settings.json"),
  Command.withExamples([
    { command: "axm sync", description: "Synchronize managed workspace state from settings.json" },
    { command: "axm sync --preview", description: "Preview workspace synchronization" },
  ]),
);
