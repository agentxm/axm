import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { renderWorkspaceGeneratorRegions } from "@agentxm/client-core/unstable/files";
import {
  applyPlan,
  resolvePlan,
  type JobStepResult,
  type PlanResolution,
  type PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import { displayPlan, WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";

const regionLabel = (count: number): string => (count === 1 ? "region" : "regions");

const fileLabel = (count: number): string => (count === 1 ? "file" : "files");

const previewPlan = (plan: ReturnType<typeof resolvePlan>): PlanResolution => ({
  _tag: "PreviewedPlan",
  name: plan.name,
  description: plan.description,
  jobs: plan.jobs,
});

export const mergePlanResolution = (
  primary: PlanResolution,
  extra: Option.Option<PlanResolution>,
): PlanResolution =>
  Option.match(extra, {
    onNone: () => primary,
    onSome: (extraResolution) =>
      primary._tag === "ExecutedPlan" && extraResolution._tag === "ExecutedPlan"
        ? {
            _tag: "ExecutedPlan",
            name: primary.name,
            description: primary.description,
            jobs: [...primary.jobs, ...extraResolution.jobs],
          }
        : primary,
  });

const collectWorkspaceGeneratorStep = Effect.fn("Files.collectWorkspaceGeneratorStep")(
  function* () {
    const ws = yield* WorkspaceMutations;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const preview = yield* renderWorkspaceGeneratorRegions({
      workspaceRoot: ws.baseDir,
      dryRun: true,
    });
    if (preview.renderedRegions === 0) return Option.none<PlannedJobStep>();

    const run = renderWorkspaceGeneratorRegions({
      workspaceRoot: ws.baseDir,
      dryRun: false,
    }).pipe(
      Effect.map((result): JobStepResult => {
        const change = result.changedFiles === 0 ? "unchanged" : "updated";
        return {
          result: "success",
          message:
            change === "unchanged"
              ? "Workspace generator regions already current"
              : `Rendered ${result.renderedRegions} workspace generator ${regionLabel(result.renderedRegions)} across ${result.changedFiles} ${fileLabel(result.changedFiles)}`,
          artifact: {
            path: "workspace generator regions",
            scope: ws.scope,
            change,
            fileCount: result.changedFiles,
            targets: [
              {
                path: "workspace generator regions",
                change,
              },
            ],
          },
        };
      }),
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    );

    return Option.some({
      key: "workspace-generator-regions",
      label: "workspace generator regions",
      readiness: "ready",
      run,
    } satisfies PlannedJobStep);
  },
);

export const runFilesWorkspaceGeneratorPhase = Effect.fn("Files.runFilesWorkspaceGeneratorPhase")(
  function* (args: { readonly dryRun: boolean }) {
    const step: Option.Option<PlannedJobStep> = yield* collectWorkspaceGeneratorStep();
    if (Option.isNone(step)) return Option.none<PlanResolution>();

    const plan = resolvePlan({
      name: "Render workspace generator regions",
      description: "Render workspace-owned generator regions",
      steps: [step.value],
    });

    if (args.dryRun) {
      yield* displayPlan(plan);
      return Option.some(previewPlan(plan));
    }

    const resolution = yield* applyPlan(plan);
    yield* displayPlan(resolution);
    return Option.some(resolution);
  },
);
