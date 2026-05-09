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
import * as Schema from "effect/Schema";
import { CliRenderer, type TableView } from "@agentxm/client-core/unstable/cli-renderer";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { expandGlobs } from "@agentxm/client-core/unstable/utils";
import { LIST_INSTALLED_SKILLS } from "../../breadcrumbs.js";

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

export const noArtifacts: ReadonlyArray<PrunableArtifact> = [];

// ---------------------------------------------------------------------------
// Core logic (shared between interactive and JSON modes)
// ---------------------------------------------------------------------------

export const collectPrunableArtifacts = Effect.fn("SkillsPrune.collect")(function* (
  patterns: ReadonlyArray<string>,
) {
  const ws = yield* WorkspaceMutations;

  // 1. Get unmanaged skills from the workspace read model (includes locations)
  const unmanagedSkills = yield* ws.records.getUnmanagedSkills();
  const allUnmanagedNames = Object.keys(unmanagedSkills);

  // 2. Apply glob pattern filtering
  const matchedNames =
    patterns.length > 0 ? expandGlobs(patterns, allUnmanagedNames) : allUnmanagedNames;

  // 3. Build the list of prunable artifacts (one entry per location)
  return matchedNames.flatMap((name) => {
    const skill = unmanagedSkills[name];
    if (!skill) return noArtifacts;
    return skill.locations.map((location): PrunableArtifact => ({ name, location }));
  });
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
          message: `Failed to remove artifact at ${artifact.location}`,
          recover: `Check file permissions for \`${artifact.location}\` and try again`,
          cause: platformError,
        }),
      ),
    );
  }
});

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export const handlePrune = Effect.fn("SkillsPrune.handle")(function* (
  args: PruneHandlerArgs,
  flags: PruneHandlerFlags,
) {
  const renderer = yield* CliRenderer;

  const artifacts = yield* collectPrunableArtifacts(args.patterns);

  // JSON mode: output via document, optionally prune
  if (artifacts.length === 0) {
    if (
      yield* renderer.result(
        { artifacts: noArtifacts, count: 0, pruned: false },
        Schema.Struct(PruneDocumentFields),
      )
    ) {
      return;
    }
    yield* renderer.success("Nothing to prune", { breadcrumbs: [LIST_INSTALLED_SKILLS] });
    return;
  }

  // With --yes: prune first, then report
  if (flags.yes) {
    yield* removeArtifacts(artifacts);

    if (
      yield* renderer.result(
        { artifacts: [...artifacts], count: artifacts.length, pruned: true },
        Schema.Struct(PruneDocumentFields),
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
    yield* renderer.result(
      { artifacts: [...artifacts], count: artifacts.length, pruned: false },
      Schema.Struct(PruneDocumentFields),
    )
  ) {
    return;
  }

  yield* renderer.table(artifacts, PrunableArtifactTable, "Prunable skill artifacts");
  yield* renderer.info(
    `Found ${artifacts.length} artifact${artifacts.length === 1 ? "" : "s"} to prune. Run with --yes to remove.`,
  );
});
