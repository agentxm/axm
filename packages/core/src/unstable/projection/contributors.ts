/**
 * Shared contributor-set resolution for aggregate ownership units.
 *
 * An aggregate managed output (the Rules region, an agent's managed hook
 * entries, the Hook fallback region, the Knowledge discovery region) is always
 * rendered whole from the complete contributor set the desired-state graph
 * reaches. Writers receive contributors from these helpers and never derive
 * membership from raw settings entries, lock rows, or the unit's own content.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import { makeAppError, type AppError } from "../app-error/index.js";
import {
  parseExtensionFqnParts,
  type ExtensionType,
  type ExtensionTypePlural,
} from "../extensions/index.js";
import {
  computeExtensionPathsForLayout,
  extensionPathSourceFromLockEntry,
  type ExtensionPathLockEntry,
} from "../extensions/extension-paths.js";
import {
  computeMaterializedTreeIntegrity,
  type TreeIntegrity,
} from "../extensions/materialized-tree.js";
import type { Handle } from "../extensions/handle.js";
import type { DesiredExtensionNode, DesiredStateGraph } from "../workspace/desired-state-graph.js";
import { desiredStateProblemsText } from "../workspace/desired-state-problem-text.js";
import type { WorkspaceLayout } from "../workspace/layout.js";

/**
 * Minimal structural view of a per-extension source lock entry. Registry
 * entries locate a canonical package under the registry extensions tree;
 * every other source class materializes under the external extensions tree.
 */
export type SourceLockEntryLike = ExtensionPathLockEntry & {
  readonly workspaceName: string;
  readonly packageOwner?: Handle | undefined;
  readonly treeIntegrity: TreeIntegrity;
};

/** One member of an aggregate unit's contributor set, resolved to content. */
export interface AggregateContributor {
  readonly node: DesiredExtensionNode;
  readonly packageRoot: string;
  /**
   * Marker identity owner for registry and workspace sources. Git and local
   * sources derive marker identity from the canonical manifest instead.
   */
  readonly identityOwner: Option.Option<Handle>;
}

/** Stable recovery-conformance identity for aggregate writes blocked by an incomplete graph. */
export const INCOMPLETE_DESIRED_STATE_BLOCKER_ID =
  "projection/desired-state-graph-complete" as const;

/**
 * Gate aggregate-unit writes on a complete desired-state graph. An operation
 * that cannot enumerate the complete contributor set writes nothing.
 */
export const requireCompleteGraph = (
  graph: DesiredStateGraph,
): Effect.Effect<DesiredStateGraph, AppError> =>
  graph.complete
    ? Effect.succeed(graph)
    : makeAppError({
        code: "conflict",
        detail: `Desired state cannot be enumerated completely; fix pack and declaration problems first: ${desiredStateProblemsText(graph.problems)}`,
      });

/** Enabled desired nodes of one extension type. */
export const activeNodesOfType = (
  graph: DesiredStateGraph,
  type: ExtensionType,
): ReadonlyArray<DesiredExtensionNode> =>
  graph.nodes.filter((node) => node.type === type && node.enabled);

/**
 * Resolve the canonical package root for one contributor from its node
 * identity and accepted lock entry. Never reads settings, never resolves
 * sources, and never touches the network.
 */
export const contributorForNode = (args: {
  readonly layout: WorkspaceLayout;
  readonly path: Path.Path;
  readonly node: DesiredExtensionNode;
  /** Type-specific segment under the extensions trees, e.g. `rules`. */
  readonly extensionDir: ExtensionTypePlural;
  readonly locked: SourceLockEntryLike | undefined;
}): Effect.Effect<AggregateContributor, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const { extensionDir, layout, locked, node, path } = args;
    if (node.identity.startsWith("workspace:")) {
      if (layout.scope === "user") {
        return yield* makeAppError({
          code: "validation",
          detail: `User workspaces do not support workspace-authored ${node.type} packages`,
        });
      }
      const identity = parseExtensionFqnParts(node.identity.slice("workspace:".length));
      if (identity === undefined || identity.type !== node.type) {
        return yield* makeAppError({
          code: "validation",
          detail: `Invalid workspace ${node.type} identity: ${node.identity}`,
        });
      }
      return {
        node,
        packageRoot: path.join(layout.authoredRoot(node.type), identity.name),
        identityOwner: Option.some(identity.owner),
      };
    }
    if (locked === undefined) {
      return yield* makeAppError({
        code: "conflict",
        detail: `Active ${node.type} has no accepted resolution: ${node.name}`,
      });
    }
    const packageRoot = computeExtensionPathsForLayout(
      path.join,
      layout,
      extensionPathSourceFromLockEntry(locked),
      extensionDir,
      locked.workspaceName,
    ).canonicalPath;
    const observedTree = yield* computeMaterializedTreeIntegrity(packageRoot);
    if (observedTree !== locked.treeIntegrity) {
      return yield* makeAppError({
        code: "conflict",
        detail: `Materialized package tree does not match the accepted lock entry: ${packageRoot}`,
        suggestions: [
          {
            description:
              "Restore the accepted package with install or update, or fork it into the authored workspace tree before editing.",
          },
        ],
      });
    }
    return {
      node,
      packageRoot,
      identityOwner:
        locked.type === "registry"
          ? Option.some(locked.owner)
          : Option.fromUndefinedOr(locked.packageOwner),
    };
  });

/**
 * Resolve the complete contributor set for one extension type: every enabled
 * node the complete desired-state graph reaches, whether declared directly or
 * contributed by a Pack, each resolved to its canonical package root.
 */
export const activeContributors = (args: {
  readonly layout: WorkspaceLayout;
  readonly path: Path.Path;
  readonly type: ExtensionType;
  readonly extensionDir: ExtensionTypePlural;
  readonly graph: DesiredStateGraph;
  readonly locked: Readonly<Record<string, SourceLockEntryLike>>;
}): Effect.Effect<
  ReadonlyArray<AggregateContributor>,
  AppError,
  FileSystem.FileSystem | Path.Path
> =>
  requireCompleteGraph(args.graph).pipe(
    Effect.flatMap((graph) =>
      Effect.forEach(activeNodesOfType(graph, args.type), (node) =>
        contributorForNode({
          layout: args.layout,
          path: args.path,
          node,
          extensionDir: args.extensionDir,
          locked: args.locked[node.name],
        }),
      ),
    ),
  );
