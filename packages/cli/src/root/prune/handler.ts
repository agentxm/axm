/**
 * Handler for `axm prune`.
 *
 * Aggregates prunable artifacts across all extension types using per-type
 * collectors (following the `axm install` aggregation pattern). In v1, only
 * the skills collector produces results; other type collectors return empty.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import type { AppError } from "@agentxm/client-core/unstable/app-error";
import type { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { previewOrApplyPlan } from "@agentxm/client-core/unstable/plan";

import {
  type PrunableArtifact,
  collectPrunableArtifacts,
  makePruneArtifactsPlan,
} from "../skills/prune/handler.js";
import { emitAppliedPlanOutcome } from "../shared/applied-plan-output.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RootPruneHandlerArgs {
  readonly patterns: ReadonlyArray<string>;
}

export interface RootPruneHandlerFlags {
  readonly yes: boolean;
}

// ---------------------------------------------------------------------------
// Per-type collectors (aggregation pattern from workspace-install.ts)
// ---------------------------------------------------------------------------

interface PruneCollector {
  readonly type: string;
  readonly collect: (
    patterns: ReadonlyArray<string>,
  ) => Effect.Effect<ReadonlyArray<PrunableArtifact>, AppError, WorkspaceMutations>;
}

const skillsPruneCollector: PruneCollector = {
  type: "skill",
  collect: (patterns) => collectPrunableArtifacts(patterns),
};

// In v1, only skills produce results. Other type collectors return empty.
const pruneCollectors: ReadonlyArray<PruneCollector> = [skillsPruneCollector];

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

const collectAllPrunableArtifacts = Effect.fn("RootPrune.collectAll")(function* (
  patterns: ReadonlyArray<string>,
) {
  const collections = yield* Effect.forEach(pruneCollectors, ({ collect }) => collect(patterns), {
    concurrency: "unbounded",
  });

  return collections.flat();
});

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export const handleRootPrune = Effect.fn("RootPrune.handle")(function* (
  args: RootPruneHandlerArgs,
  flags: RootPruneHandlerFlags,
) {
  const artifacts = yield* collectAllPrunableArtifacts(args.patterns);

  if (artifacts.length === 0) {
    yield* emitNoOpOutcome("prune", {
      planName: "Prune artifacts",
      message: "No unmanaged artifacts pruned.",
      withoutSuggestions: true,
    });
    return;
  }

  const plan = yield* makePruneArtifactsPlan({
    artifacts,
    planName: "Prune artifacts",
    planDescription: "Prune unmanaged artifacts. Run with --yes to remove.",
  });
  const resolution = yield* previewOrApplyPlan(plan, {
    yes: flags.yes,
    force: false,
    preview: !flags.yes,
    displayApplied: false,
  });
  yield* emitAppliedPlanOutcome({
    command: "prune",
    headline: "Pruned unmanaged artifacts.",
    resolution,
    suggestions: [],
  });
});
