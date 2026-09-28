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
} from "@agentxm/extension-model/unstable/extensions";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  contributorSetBlockers,
  contributorSetComplete,
  desiredStateProblemsText,
  observeCanonicalExtension,
  unresolvedPackRoutesText,
  type DesiredContributorBlockers,
  type LockEntry,
  type DesiredExtensionNode,
  type DesiredStateGraph,
  type WorkspaceLayout,
} from "../workspace-state/index.js";
import { formatDesiredIdentity } from "../workspace-state/index.js";

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

/** Stable recovery-conformance identity for aggregate writes blocked by an incomplete contributor set. */
export const INCOMPLETE_DESIRED_STATE_BLOCKER_ID =
  "projection/desired-state-graph-complete" as const;

/** Stable text naming every blocker of one contributor set: unresolved Packs, then problems. */
export const contributorBlockersText = (blockers: DesiredContributorBlockers): string =>
  [
    ...(blockers.routes.length === 0 ? [] : [unresolvedPackRoutesText(blockers.routes)]),
    ...(blockers.problems.length === 0 ? [] : [desiredStateProblemsText(blockers.problems)]),
  ].join("; ");

/**
 * Gate aggregate-unit writes on a complete contributor set for one extension
 * type: every active Pack's routes established, and no problem about an
 * extension of that type. A problem about another type does not block the
 * unit, and an operation that cannot enumerate the set writes nothing.
 */
export const requireCompleteContributors = (
  graph: DesiredStateGraph,
  type: ExtensionType,
): Effect.Effect<DesiredStateGraph, DesiredStateIncomplete> => {
  const blockers = contributorSetBlockers(graph, type);
  return contributorSetComplete(blockers)
    ? Effect.succeed(graph)
    : new DesiredStateIncomplete({ problems: contributorBlockersText(blockers) });
};

/** Enabled desired nodes of one extension type. */
export const activeNodesOfType = (
  graph: DesiredStateGraph,
  type: ExtensionType,
): ReadonlyArray<DesiredExtensionNode> =>
  graph.nodes.filter((node) => node.type === type && node.enabled);

/**
 * Resolve one contributor to its canonical package root. The canonical
 * observation is the only judge of whether accepted content may serve as
 * projection input: an aggregate unit renders a contributor exactly when
 * that observation finds it usable, and refuses the whole unit otherwise.
 * Never reads settings, never resolves sources, and never touches the
 * network.
 */
export const contributorForNode = (args: {
  readonly layout: WorkspaceLayout;
  readonly node: DesiredExtensionNode;
  readonly accepted: LockEntry | undefined;
}): Effect.Effect<
  AggregateContributor,
  | AuthoredContributorUnsupported
  | ContributorIdentityInvalid
  | ContributorUnresolved
  | ContributorTreeMismatch,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const { accepted, layout, node } = args;
    const workspaceAuthored = node.identity.authority === "workspace";
    if (workspaceAuthored && layout.scope === "user") {
      return yield* new AuthoredContributorUnsupported({ type: node.type });
    }
    const authoredIdentity =
      node.identity.authority === "workspace"
        ? parseExtensionFqnParts(node.identity.fqn)
        : undefined;
    if (
      workspaceAuthored &&
      (authoredIdentity === undefined || authoredIdentity.type !== node.type)
    ) {
      return yield* new ContributorIdentityInvalid({
        type: node.type,
        identity: formatDesiredIdentity(node.identity),
      });
    }
    const observation = yield* observeCanonicalExtension({ layout, desired: node, accepted });
    if (observation.status === "missing-resolution") {
      return yield* new ContributorUnresolved({ type: node.type, name: node.name });
    }
    if (observation.status !== "usable" || observation.path === undefined) {
      return yield* new ContributorTreeMismatch({ packageRoot: observation.path ?? node.name });
    }
    return {
      node,
      packageRoot: observation.path,
      identityOwner:
        authoredIdentity === undefined
          ? Option.fromUndefinedOr(accepted?.identity.owner)
          : Option.some(authoredIdentity.owner),
    };
  });

/**
 * Resolve the complete contributor set for one extension type: every enabled
 * node the desired-state graph reaches, whether declared directly or
 * contributed by a Pack, each resolved to its canonical package root. The
 * set is proven complete for that type before any contributor is resolved.
 */
export const activeContributors = (args: {
  readonly layout: WorkspaceLayout;
  readonly type: ExtensionType;
  readonly graph: DesiredStateGraph;
  readonly accepted: Readonly<Record<string, LockEntry>>;
}): Effect.Effect<
  ReadonlyArray<AggregateContributor>,
  | DesiredStateIncomplete
  | AuthoredContributorUnsupported
  | ContributorIdentityInvalid
  | ContributorUnresolved
  | ContributorTreeMismatch,
  FileSystem.FileSystem | Path.Path
> =>
  requireCompleteContributors(args.graph, args.type).pipe(
    Effect.flatMap((graph) =>
      Effect.forEach(activeNodesOfType(graph, args.type), (node) =>
        contributorForNode({ layout: args.layout, node, accepted: args.accepted[node.name] }),
      ),
    ),
  );
