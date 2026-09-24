/**
 * Which Knowledge bundles the selected workspace has installed and enabled,
 * and where each one's package and source root sit on disk.
 *
 * This is a read-side projection fact, not a feature decision: Knowledge
 * discovery reads the same selection the Knowledge inventory reports, so the
 * rule lives once, here, and both features consume it.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";

import { KNOWLEDGE_SOURCE_DIR } from "@agentxm/extension-model/unstable/knowledge";
import {
  DesiredStateReader,
  LockfileReader,
  observeCanonicalExtension,
  WorkspaceLocation,
  type CanonicalObservationStatus,
} from "../../desired-state/index.js";

/** One installed, enabled Knowledge bundle in the selected workspace. */
export interface InstalledKnowledgeBundle {
  readonly name: string;
  /** The OKF package root: the directory holding the bundle manifest. */
  readonly packageRoot: string;
  /** The bundle's authored source root inside the package. */
  readonly sourceRoot: string;
  /** What the canonical observation found at that root. */
  readonly status: CanonicalObservationStatus;
}

/** The desired Knowledge state could not be read, or a named bundle is absent. */
export class InstalledKnowledgeUnavailable extends Data.TaggedError(
  "InstalledKnowledgeUnavailable",
)<{
  readonly reason: "desired-state-incomplete" | "bundle-not-installed";
  readonly detail: string;
  readonly bundle?: string;
}> {}

/**
 * The enabled Knowledge bundles of the selected workspace, ordered by name.
 *
 * A named bundle that is not installed is a typed refusal, so callers do not
 * have to distinguish "no bundles" from "not that bundle".
 */
export const selectInstalledKnowledgeBundles = Effect.fn(
  "Projection.selectInstalledKnowledgeBundles",
)(function* (options?: { readonly name?: string }) {
  const location = yield* WorkspaceLocation;
  const desiredState = yield* DesiredStateReader;
  const lockfile = yield* LockfileReader;
  const path = yield* Path.Path;
  const layout = yield* Ref.get(location.layout);
  const graph = yield* desiredState.graph();
  if (!graph.complete) {
    return yield* new InstalledKnowledgeUnavailable({
      reason: "desired-state-incomplete",
      detail:
        "AXM could not determine which Knowledge bundles should be installed because some pack or axm.json entries are invalid",
    });
  }
  const locked = yield* lockfile.entries("knowledge");
  // The canonical observation places every desired bundle; a bundle it
  // cannot place (no accepted resolution, foreign origin) is left out, and
  // the status it found travels with the root for the reader to report.
  const selected = yield* Effect.forEach(
    graph.nodes
      .filter(
        (node) =>
          node.type === "knowledge" &&
          node.enabled &&
          (options?.name === undefined || node.name === options.name),
      )
      .sort((left, right) => left.name.localeCompare(right.name)),
    (node) =>
      Effect.map(
        observeCanonicalExtension({ layout, desired: node, accepted: locked[node.name] }),
        (observation): ReadonlyArray<InstalledKnowledgeBundle> =>
          observation.path === undefined
            ? []
            : [
                {
                  name: node.name,
                  packageRoot: observation.path,
                  sourceRoot: path.join(observation.path, KNOWLEDGE_SOURCE_DIR),
                  status: observation.status,
                },
              ],
      ),
    { concurrency: 1 },
  ).pipe(Effect.map((bundles) => bundles.flat()));
  if (options?.name !== undefined && selected.length === 0) {
    return yield* new InstalledKnowledgeUnavailable({
      reason: "bundle-not-installed",
      detail: `Knowledge bundle "${options.name}" is not installed`,
      bundle: options.name,
    });
  }
  return selected;
});
