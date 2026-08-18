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
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import { makeAppError, type AppError } from "../app-error/index.js";
import {
  EXTERNAL_EXTENSIONS_DIR,
  REGISTRY_EXTENSIONS_DIR,
  parseExtensionFqnParts,
  type ExtensionType,
} from "../extensions/index.js";
import type { Handle } from "../extensions/handle.js";
import type {
  DesiredExtensionNode,
  DesiredStateGraph,
  DesiredStateProblem,
} from "../workspace/desired-state-graph.js";

/**
 * Minimal structural view of a per-extension source lock entry. Registry
 * entries locate a canonical package under the registry extensions tree;
 * every other source class materializes under the external extensions tree.
 */
export type SourceLockEntryLike =
  | {
      readonly type: "registry";
      readonly owner: Handle;
      readonly name: string;
    }
  | {
      readonly type: "github" | "gitlab" | "bitbucket" | "azurerepos" | "git" | "local";
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

const problemSummary = (problems: ReadonlyArray<DesiredStateProblem>): string =>
  problems
    .map((problem) => ("pack" in problem ? `${problem.type} (${problem.pack})` : problem.type))
    .join("; ");

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
        detail: `Desired state cannot be enumerated completely; fix pack and declaration problems first: ${problemSummary(graph.problems)}`,
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
  readonly baseDir: string;
  readonly path: Path.Path;
  readonly node: DesiredExtensionNode;
  /** Type-specific segment under the extensions trees, e.g. `rules`. */
  readonly extensionDir: string;
  readonly locked: SourceLockEntryLike | undefined;
}): Effect.Effect<AggregateContributor, AppError> =>
  Effect.gen(function* () {
    const { baseDir, extensionDir, locked, node, path } = args;
    if (node.identity.startsWith("workspace:")) {
      const identity = parseExtensionFqnParts(node.identity.slice("workspace:".length));
      if (identity === undefined || identity.type !== node.type) {
        return yield* makeAppError({
          code: "validation",
          detail: `Invalid workspace ${node.type} identity: ${node.identity}`,
        });
      }
      return {
        node,
        packageRoot: path.join(
          baseDir,
          REGISTRY_EXTENSIONS_DIR,
          identity.owner,
          extensionDir,
          identity.name,
        ),
        identityOwner: Option.some(identity.owner),
      };
    }
    if (locked === undefined) {
      return yield* makeAppError({
        code: "conflict",
        detail: `Active ${node.type} has no accepted resolution: ${node.name}`,
      });
    }
    if (locked.type === "registry") {
      return {
        node,
        packageRoot: path.join(
          baseDir,
          REGISTRY_EXTENSIONS_DIR,
          locked.owner,
          extensionDir,
          locked.name,
        ),
        identityOwner: Option.some(locked.owner),
      };
    }
    return {
      node,
      packageRoot: path.join(baseDir, EXTERNAL_EXTENSIONS_DIR, extensionDir, node.name),
      identityOwner: Option.none<Handle>(),
    };
  });

/**
 * Resolve the complete contributor set for one extension type: every enabled
 * node the complete desired-state graph reaches, whether declared directly or
 * contributed by a Pack, each resolved to its canonical package root.
 */
export const activeContributors = (args: {
  readonly baseDir: string;
  readonly path: Path.Path;
  readonly type: ExtensionType;
  readonly extensionDir: string;
  readonly graph: DesiredStateGraph;
  readonly locked: Readonly<Record<string, SourceLockEntryLike>>;
}): Effect.Effect<ReadonlyArray<AggregateContributor>, AppError> =>
  requireCompleteGraph(args.graph).pipe(
    Effect.flatMap((graph) =>
      Effect.forEach(activeNodesOfType(graph, args.type), (node) =>
        contributorForNode({
          baseDir: args.baseDir,
          path: args.path,
          node,
          extensionDir: args.extensionDir,
          locked: args.locked[node.name],
        }),
      ),
    ),
  );
