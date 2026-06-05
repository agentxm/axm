import { Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import type {
  JobStepArtifact,
  JobStepResult,
  Plan,
  PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { emitAppliedPlanOutcome } from "../shared/applied-plan-output.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";
import { previewOrApplyLocalPlan } from "../shared/local-plan.js";

const filesLockArtifact = (scope: JobStepArtifact["scope"]): JobStepArtifact => ({
  path: ".axm/axm-lock.yaml",
  scope,
  change: "removed",
  fileCount: 1,
  targets: [{ path: ".axm/axm-lock.yaml", change: "updated" }],
});

const makePrunePlan = (
  staleEntries: ReadonlyArray<string>,
  ws: typeof WorkspaceMutations.Service,
): Plan => ({
  _tag: "Plan",
  name: "Prune files lock entries",
  description: Option.some(
    `Remove ${staleEntries.length} stale files lock ${staleEntries.length === 1 ? "entry" : "entries"}`,
  ),
  jobs: [
    {
      concurrency: 1,
      steps: staleEntries.map<PlannedJobStep>((name) => ({
        label: name,
        readiness: "ready",
        run: ws.removeFilesLock(name).pipe(
          Effect.as({
            result: "success",
            message: `Pruned files lock entry ${name}`,
            artifact: filesLockArtifact(ws.scope),
          } satisfies JobStepResult),
        ),
      })),
    },
  ],
});

export const handleFilesPrune = Effect.fn("FilesPrune.handle")(function* () {
  const ws = yield* WorkspaceMutations;
  const configured = yield* ws.getConfiguredFilesEntries();
  const locked = yield* ws.getLockedFiles();
  const stale = Object.keys(locked).filter((name) => configured[name] === undefined);

  if (stale.length === 0) {
    yield* emitNoOpOutcome("files.prune", {
      planName: "Prune files lock entries",
      message: "No files lock entries pruned.",
      withoutSuggestions: true,
    });
    return;
  }

  const resolution = yield* previewOrApplyLocalPlan(makePrunePlan(stale, ws), {
    preview: false,
    displayApplied: false,
  });
  yield* emitAppliedPlanOutcome({
    command: "files.prune",
    headline: "Pruned files lock entries.",
    resolution,
    suggestions: [],
  });
});

const pruneConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("Prune project (default) or user-level files lock entries"),
  ),
} as const;

export const pruneCommand = Command.make("prune", pruneConfig, ({ scope }) =>
  handleFilesPrune().pipe(withWorkspace(scope), withRuntime("files prune")),
).pipe(
  withArgvTracking(pruneConfig),
  Command.withDescription("Prune stale files lock entries"),
  Command.withExamples([
    {
      command: "axm files prune",
      description: "Prune stale files lock entries",
    },
  ]),
);
