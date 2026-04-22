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
import * as Schema from "effect/Schema";
import { CliRenderer, type TableView } from "@agentxm/client-core/unstable/cli-renderer";
import type { AppError } from "@agentxm/client-core/unstable/app-error";
import type { Workspace } from "@agentxm/client-core/unstable/workspace";

import {
  type PrunableArtifact,
  collectPrunableArtifacts,
  noArtifacts,
  removeArtifacts,
} from "../skills/prune/handler.js";

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
  ) => Effect.Effect<ReadonlyArray<PrunableArtifact>, AppError, Workspace>;
}

const skillsPruneCollector: PruneCollector = {
  type: "skill",
  collect: (patterns) => collectPrunableArtifacts(patterns),
};

// In v1, only skills produce results. Other type collectors return empty.
const pruneCollectors: ReadonlyArray<PruneCollector> = [skillsPruneCollector];

// ---------------------------------------------------------------------------
// JSON output schema
// ---------------------------------------------------------------------------

const PrunableArtifactSchema = Schema.Struct({
  name: Schema.String,
  location: Schema.String,
});

const PruneDocumentFields = {
  artifacts: Schema.Array(PrunableArtifactSchema),
  count: Schema.Number,
  pruned: Schema.Boolean,
} satisfies Schema.Struct.Fields;

// ---------------------------------------------------------------------------
// Table view
// ---------------------------------------------------------------------------

const PrunableArtifactTable = {
  columns: {
    name: { header: "Name" },
    location: { header: "Location" },
  },
} as const satisfies TableView<PrunableArtifact>;

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
  const renderer = yield* CliRenderer;

  const artifacts = yield* collectAllPrunableArtifacts(args.patterns);

  // JSON mode: output via document, optionally prune
  if (artifacts.length === 0) {
    if (
      yield* renderer.document(
        "prune",
        { artifacts: noArtifacts, count: 0, pruned: false },
        PruneDocumentFields,
      )
    ) {
      return;
    }
    yield* renderer.success("Nothing to prune");
    return;
  }

  // With --yes: prune first, then report
  if (flags.yes) {
    yield* removeArtifacts(artifacts);

    if (
      yield* renderer.document(
        "prune",
        { artifacts: [...artifacts], count: artifacts.length, pruned: true },
        PruneDocumentFields,
      )
    ) {
      return;
    }

    yield* renderer.success(
      `Pruned ${artifacts.length} artifact${artifacts.length === 1 ? "" : "s"}`,
    );
    return;
  }

  // Without --yes: read-only preview
  if (
    yield* renderer.document(
      "prune",
      { artifacts: [...artifacts], count: artifacts.length, pruned: false },
      PruneDocumentFields,
    )
  ) {
    return;
  }

  yield* renderer.table(artifacts, PrunableArtifactTable, "Prunable artifacts");
  yield* renderer.info(
    `Found ${artifacts.length} artifact${artifacts.length === 1 ? "" : "s"} to prune. Run with --yes to remove.`,
  );
});
