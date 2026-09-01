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
import {
  AuthoredContributorUnsupported,
  ContributorIdentityInvalid,
  ContributorTreeMismatch,
  ContributorUnresolved,
  DesiredStateIncomplete,
} from "./errors.js";
import {
  parseExtensionFqnParts,
  type ExtensionType,
  type ExtensionTypePlural,
} from "@agentxm/extension-model/unstable/extensions";
import {
  computeExtensionPathsForLayout,
  extensionPathSourceFromLockEntry,
  type ExtensionPathLockEntry,
} from "@agentxm/workspace-state";
import {
  computeMaterializedTreeIntegrity,
  type MaterializedTreeInvalid,
  type TreeIntegrity,
} from "@agentxm/workspace-state";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import type { DesiredExtensionNode, DesiredStateGraph } from "@agentxm/workspace-state";
import { desiredStateProblemsText } from "@agentxm/workspace-state";
import type { WorkspaceLayout } from "@agentxm/workspace-state";

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
): Effect.Effect<DesiredStateGraph, DesiredStateIncomplete> =>
  graph.complete
    ? Effect.succeed(graph)
    : new DesiredStateIncomplete({ problems: desiredStateProblemsText(graph.problems) });

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
}): Effect.Effect<
  AggregateContributor,
  | AuthoredContributorUnsupported
  | ContributorIdentityInvalid
  | ContributorUnresolved
  | ContributorTreeMismatch
  | MaterializedTreeInvalid,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const { extensionDir, layout, locked, node, path } = args;
    if (node.identity.startsWith("workspace:")) {
      if (layout.scope === "user") {
        return yield* new AuthoredContributorUnsupported({ type: node.type });
      }
      const identity = parseExtensionFqnParts(node.identity.slice("workspace:".length));
      if (identity === undefined || identity.type !== node.type) {
        return yield* new ContributorIdentityInvalid({
          type: node.type,
          identity: node.identity,
        });
      }
      return {
        node,
        packageRoot: path.join(layout.authoredRoot(node.type), identity.name),
        identityOwner: Option.some(identity.owner),
      };
    }
    if (locked === undefined) {
      return yield* new ContributorUnresolved({ type: node.type, name: node.name });
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
      return yield* new ContributorTreeMismatch({ packageRoot });
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
  | DesiredStateIncomplete
  | AuthoredContributorUnsupported
  | ContributorIdentityInvalid
  | ContributorUnresolved
  | ContributorTreeMismatch
  | MaterializedTreeInvalid,
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
