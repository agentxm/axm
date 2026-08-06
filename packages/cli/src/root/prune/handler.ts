/**
 * Handler for `axm prune`.
 *
 * Aggregates prunable artifacts across every per-agent extension type using
 * per-type collectors (following the `axm install` aggregation pattern).
 * Workspace-placed types (files, rules, knowledge) write into workspace files
 * rather than per-agent artifact directories, so they have nothing to sweep.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import type { AppError } from "@agentxm/client-core/unstable/app-error";
import type { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import {
  PER_AGENT_EXTENSION_TYPES,
  type PerAgentType,
} from "@agentxm/client-core/unstable/extension-types";
import { previewOrApplyPlan } from "@agentxm/client-core/unstable/plan";

import {
  type PrunableArtifact,
  collectPrunableArtifactsForType,
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
  readonly type: PerAgentType;
  readonly collect: (
    patterns: ReadonlyArray<string>,
  ) => Effect.Effect<ReadonlyArray<PrunableArtifact>, AppError, WorkspaceMutations>;
}

/**
 * One collector per per-agent type.
 *
 * Keyed by `PerAgentType` so a new per-agent type fails compile here rather
 * than silently leaving its unmanaged artifacts behind on every sweep.
 */
export const PRUNE_COLLECTORS: Record<PerAgentType, PruneCollector> = {
  skill: {
    type: "skill",
    collect: (patterns) => collectPrunableArtifactsForType("skill", patterns),
  },
  command: {
    type: "command",
    collect: (patterns) => collectPrunableArtifactsForType("command", patterns),
  },
  "mcp-server": {
    type: "mcp-server",
    collect: (patterns) => collectPrunableArtifactsForType("mcp-server", patterns),
  },
  subagent: {
    type: "subagent",
    collect: (patterns) => collectPrunableArtifactsForType("subagent", patterns),
  },
  hook: { type: "hook", collect: (patterns) => collectPrunableArtifactsForType("hook", patterns) },
};

const pruneCollectors: ReadonlyArray<PruneCollector> = PER_AGENT_EXTENSION_TYPES.map(
  (type) => PRUNE_COLLECTORS[type],
);

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
