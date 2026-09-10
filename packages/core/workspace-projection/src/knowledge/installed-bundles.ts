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

import {
  KNOWLEDGE_EXTENSION_DIR,
  KNOWLEDGE_SOURCE_DIR,
} from "@agentxm/extension-model/unstable/knowledge";
import {
  computeExtensionPathsForLayout,
  DesiredStateReader,
  extensionPathSourceFromLockEntry,
  LockfileReader,
  WorkspaceLocation,
  type KnowledgeLockEntry,
  type WorkspaceLayout,
} from "@agentxm/workspace-state";

/** One installed, enabled Knowledge bundle in the selected workspace. */
export interface InstalledKnowledgeBundle {
  readonly name: string;
  /** The OKF package root: the directory holding the bundle manifest. */
  readonly packageRoot: string;
  /** The bundle's authored source root inside the package. */
  readonly sourceRoot: string;
}

/** The desired Knowledge state could not be read, or a named bundle is absent. */
export class InstalledKnowledgeUnavailable extends Data.TaggedError(
  "InstalledKnowledgeUnavailable",
)<{
  readonly reason: "desired-state-incomplete" | "bundle-not-installed";
  readonly detail: string;
  readonly bundle?: string;
}> {}

const bundleSourceRoot = (
  layout: WorkspaceLayout,
  node: { readonly name: string; readonly identity: string },
  entry: KnowledgeLockEntry | undefined,
  path: Path.Path,
): string | undefined => {
  if (node.identity.startsWith("workspace:")) {
    return layout.scope !== "project"
      ? undefined
      : path.join(layout.authoredRoot("knowledge"), node.name, KNOWLEDGE_SOURCE_DIR);
  }
  if (entry === undefined) return undefined;
  return path.join(
    computeExtensionPathsForLayout(
      path.join,
      layout,
      extensionPathSourceFromLockEntry(entry),
      KNOWLEDGE_EXTENSION_DIR,
      entry.workspaceName,
    ).canonicalPath,
    KNOWLEDGE_SOURCE_DIR,
  );
};

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
        "Knowledge desired state cannot be inspected until pack and declaration problems are fixed",
    });
  }
  const locked = yield* lockfile.entries("knowledge");
  const selected = graph.nodes
    .filter(
      (node) =>
        node.type === "knowledge" &&
        node.enabled &&
        (options?.name === undefined || node.name === options.name),
    )
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((node): ReadonlyArray<InstalledKnowledgeBundle> => {
      const sourceRoot = bundleSourceRoot(layout, node, locked[node.name], path);
      return sourceRoot === undefined
        ? []
        : [{ name: node.name, packageRoot: path.dirname(sourceRoot), sourceRoot }];
    });
  if (options?.name !== undefined && selected.length === 0) {
    return yield* new InstalledKnowledgeUnavailable({
      reason: "bundle-not-installed",
      detail: `Knowledge bundle "${options.name}" is not installed`,
      bundle: options.name,
    });
  }
  return selected;
});
