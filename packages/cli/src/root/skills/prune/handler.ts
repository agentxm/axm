/**
 * Handler for `axm skills prune`.
 *
 * Removes on-disk artifacts for skills reported as unmanaged by the
 * workspace read-model record projection. Supports glob pattern filtering, confirmation UX,
 * and JSON output modes.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { WorkspaceMutations, unmanagedRowsByName } from "@agentxm/client-core/unstable/workspace";
import type { PerAgentType } from "@agentxm/client-core/unstable/extension-types";
import { expandGlobs } from "@agentxm/client-core/unstable/utils";
import type { JobStepResult, Plan, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import { previewOrApplyPlan } from "@agentxm/client-core/unstable/plan";
import { emitAppliedPlanOutcome } from "../../shared/applied-plan-output.js";
import { LIST_INSTALLED_SKILLS } from "../../suggested-actions.js";
import { emitNoOpOutcome } from "../../shared/no-op-output.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PruneHandlerArgs {
  readonly patterns: ReadonlyArray<string>;
}

export interface PruneHandlerFlags {
  readonly yes: boolean;
}

export interface PrunableArtifact {
  readonly name: string;
  readonly location: string;
}

export const noArtifacts: ReadonlyArray<PrunableArtifact> = [];

// ---------------------------------------------------------------------------
// Core logic (shared between interactive and JSON modes)
// ---------------------------------------------------------------------------

/**
 * Collect prunable artifacts for one extension type.
 *
 * Every unmanaged read-model row carries workspace-relative `locations`, so the
 * same collection works for any type that can appear on disk unmanaged.
 */
export const collectPrunableArtifactsForType = Effect.fn("Prune.collectForType")(function* (
  type: PerAgentType,
  patterns: ReadonlyArray<string>,
) {
  const ws = yield* WorkspaceMutations;

  // 1. Get unmanaged entries from the workspace read model (includes locations)
  const unmanaged = yield* ws.records.rows(type).pipe(Effect.map(unmanagedRowsByName));
  const allUnmanagedNames = Object.keys(unmanaged);

  // 2. Apply glob pattern filtering
  const matchedNames =
    patterns.length > 0 ? expandGlobs(patterns, allUnmanagedNames) : allUnmanagedNames;

  // 3. Build the list of prunable artifacts (one entry per location)
  return matchedNames.flatMap((name) => {
    const row = unmanaged[name];
    if (!row) return noArtifacts;
    return row.locations.map((location): PrunableArtifact => ({ name, location }));
  });
});

export const collectPrunableArtifacts = Effect.fn("SkillsPrune.collect")(function* (
  patterns: ReadonlyArray<string>,
) {
  return yield* collectPrunableArtifactsForType("skill", patterns);
});

export const removeArtifacts = Effect.fn("SkillsPrune.remove")(function* (
  artifacts: ReadonlyArray<PrunableArtifact>,
) {
  const ws = yield* WorkspaceMutations;
  const fsService = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  for (const artifact of artifacts) {
    const absolutePath = path.join(ws.baseDir, artifact.location);
    yield* fsService.remove(absolutePath, { recursive: true }).pipe(
      Effect.mapError((platformError) =>
        makeAppError({
          code: "internal",
          detail: `Failed to remove artifact at ${artifact.location}`,
          recover: `Check file permissions for \`${artifact.location}\` and try again`,
          cause: platformError,
        }),
      ),
    );
  }
});

export const makePruneArtifactsPlan = Effect.fn("SkillsPrune.makePlan")(function* (args: {
  readonly artifacts: ReadonlyArray<PrunableArtifact>;
  readonly planName: string;
  readonly planDescription: string;
}) {
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const provideServices = <A, E>(
    effect: Effect.Effect<A, E, WorkspaceMutations | FileSystem.FileSystem | Path.Path>,
  ): Effect.Effect<A, E, never> =>
    effect.pipe(
      Effect.provideService(WorkspaceMutations, ws),
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    );

  const steps: ReadonlyArray<PlannedJobStep> = args.artifacts.map((artifact) => ({
    key: artifact.location,
    readiness: "ready",
    label: artifact.name,
    run: provideServices(removeArtifacts([artifact])).pipe(
      Effect.as({
        result: "success",
        message: `Pruned ${artifact.name}`,
        artifact: {
          path: artifact.location,
          scope: ws.scope,
          change: "removed",
        },
      } satisfies JobStepResult),
    ),
  }));

  return {
    _tag: "Plan",
    name: args.planName,
    description: Option.some(args.planDescription),
    jobs: [{ concurrency: 1, steps }],
  } satisfies Plan;
});

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export const handlePrune = Effect.fn("SkillsPrune.handle")(function* (
  args: PruneHandlerArgs,
  flags: PruneHandlerFlags,
) {
  const artifacts = yield* collectPrunableArtifacts(args.patterns);

  if (artifacts.length === 0) {
    yield* emitNoOpOutcome("skills.prune", {
      planName: "Prune skill artifacts",
      message: "No unmanaged skill artifacts pruned.",
      suggestions: [LIST_INSTALLED_SKILLS],
    });
    return;
  }

  const plan = yield* makePruneArtifactsPlan({
    artifacts,
    planName: "Prune skill artifacts",
    planDescription: "Prune unmanaged skill artifacts. Run with --yes to remove.",
  });
  const resolution = yield* previewOrApplyPlan(plan, {
    yes: flags.yes,
    force: false,
    preview: !flags.yes,
    displayApplied: false,
  });
  yield* emitAppliedPlanOutcome({
    command: "skills.prune",
    headline: "Pruned unmanaged skill artifacts.",
    resolution,
    suggestions: [LIST_INSTALLED_SKILLS],
  });
});
