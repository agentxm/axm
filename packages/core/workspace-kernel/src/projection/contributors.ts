/**
 * Shared contributor-set resolution for aggregate ownership units.
 *
 * An aggregate managed output (the Rules region, an agent's managed hook
 * entries, native Hook groups, the Knowledge discovery region) is always
 * rendered whole from the complete contributor set the desired-state graph
 * reaches. Writers receive contributors from these helpers and never derive
 * membership from raw settings entries, lock rows, or the unit's own content.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
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
import type { SourceHash } from "@agentxm/extension-model/unstable/sources/source-hash";
import type { ExtensionManifest } from "@agentxm/extension-content";
import {
  contributorSetBlockers,
  contributorSetComplete,
  CurrentWorkspaceReadPhase,
  desiredStateProblemsText,
  observeCanonicalExtensionCapturing,
  unresolvedPackRoutesText,
  type CanonicalObservation,
  type CapturedManifest,
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
  /**
   * The manifest this contributor's canonical observation read, handed only
   * to a caller that asked for it, for that caller's own call.
   */
  readonly manifest?: Option.Option<CapturedManifest>;
  /**
   * The package content hash of `packageRoot`, framed from the strict walk
   * this contributor's canonical observation made of the accepted tree,
   * handed only to a caller that asked for it, for that caller's own call.
   * `None` when the observation made no such walk.
   */
  readonly contentHash?: Option.Option<{ readonly root: string; readonly contentHash: SourceHash }>;
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

/**
 * Canonical observations one caller made of desired nodes inside one
 * observation read phase, through that phase's own observation port.
 */
export interface CanonicalObservationHandoff {
  readonly phase: NonNullable<Context.Service.Shape<typeof CurrentWorkspaceReadPhase>>;
  readonly fileSystem: FileSystem.FileSystem;
  /**
   * The observation of exactly this desired node object, with the accepted
   * row and layout it was made against; `None` when the caller made none.
   */
  readonly observed: (desired: DesiredExtensionNode) => Option.Option<{
    readonly accepted: LockEntry | undefined;
    readonly layout: WorkspaceLayout;
    readonly observation: CanonicalObservation;
    readonly manifest: Option.Option<CapturedManifest>;
  }>;
  /**
   * The resolution the caller settled, through the same port in the same
   * phase, of the workspace-authored package of `type` named `name` under
   * exactly `layout`: the package root it resolved, its deep-frozen manifest
   * decode, and its package content hash. `None` when it settled none.
   */
  readonly authoredPackage?: (args: {
    readonly type: ExtensionType;
    readonly name: string;
    readonly layout: WorkspaceLayout;
  }) => Option.Option<{
    readonly root: string;
    readonly manifest: ExtensionManifest;
    readonly hash: SourceHash;
  }>;
}

/** The handoff contributor selection may take observations from; none by default. */
export const CurrentCanonicalObservationHandoff = Context.Reference<
  CanonicalObservationHandoff | undefined
>("@agentxm/workspace-kernel/projection/contributors/CurrentCanonicalObservationHandoff", {
  defaultValue: () => undefined,
});

/**
 * The current handoff, only while the phase it was made in is still the
 * active observation phase and the caller reads through that phase's own
 * port, the port the handoff was made through.
 */
const currentHandoff = Effect.gen(function* () {
  const handoff = yield* CurrentCanonicalObservationHandoff;
  if (handoff === undefined) return Option.none<CanonicalObservationHandoff>();
  const phase = yield* CurrentWorkspaceReadPhase;
  const fileSystem = yield* FileSystem.FileSystem;
  return phase === undefined ||
    phase !== handoff.phase ||
    !phase.isActive() ||
    !phase.observations ||
    fileSystem !== phase.fileSystem ||
    fileSystem !== handoff.fileSystem
    ? Option.none<CanonicalObservationHandoff>()
    : Option.some(handoff);
});

/**
 * The handed-over resolution of the workspace-authored package of `type`
 * named `name` under exactly `layout`, gated as `handedOverCanonicalObservation`
 * gates observations. Anything else resolves the package for itself.
 */
export const handedOverAuthoredPackage = (args: {
  readonly type: ExtensionType;
  readonly name: string;
  readonly layout: WorkspaceLayout;
}) =>
  Effect.map(currentHandoff, (current) =>
    Option.flatMap(current, (handoff) =>
      handoff.authoredPackage === undefined ? Option.none() : handoff.authoredPackage(args),
    ),
  );

/**
 * The handed-over observation of `node`, only while the phase it was made in
 * is still the active observation phase, the caller reads through that
 * phase's own port, and the observation was made against the identical
 * accepted row and layout. The caller receives its own copy; anything else
 * observes for itself.
 */
export const handedOverCanonicalObservation = (args: {
  readonly layout: WorkspaceLayout;
  readonly node: DesiredExtensionNode;
  readonly accepted: LockEntry | undefined;
}) =>
  Effect.gen(function* () {
    const current = yield* currentHandoff;
    if (Option.isNone(current)) return Option.none();
    const handoff = current.value;
    return Option.flatMap(handoff.observed(args.node), (prior) =>
      prior.accepted === args.accepted && prior.layout === args.layout
        ? Option.some({
            observation: structuredClone(prior.observation),
            manifest: Option.map(prior.manifest, ({ path, text, decode }) => ({
              path,
              text,
              decode,
            })),
          })
        : Option.none(),
    );
  });

/** Enabled desired nodes of one extension type. */
const activeNodesOfType = (
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
const contributorForNode = (args: {
  readonly layout: WorkspaceLayout;
  readonly node: DesiredExtensionNode;
  readonly accepted: LockEntry | undefined;
  readonly captureManifests: boolean;
  readonly captureContentHash: boolean;
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
    const handedOver = yield* handedOverCanonicalObservation({ layout, node, accepted });
    const { observation, manifest, digests } = Option.isSome(handedOver)
      ? { ...handedOver.value, digests: Option.none() }
      : yield* observeCanonicalExtensionCapturing({
          layout,
          desired: node,
          accepted,
          ...(args.captureContentHash ? { digestAcceptedTree: () => true } : {}),
        });
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
      ...(args.captureManifests ? { manifest } : {}),
      ...(args.captureContentHash
        ? {
            contentHash: Option.flatMap(digests, ({ root, contentHash }) =>
              Option.map(contentHash, (hash) => Object.freeze({ root, contentHash: hash })),
            ),
          }
        : {}),
    };
  });

/**
 * Resolve the complete contributor set for one extension type: every enabled
 * node the desired-state graph reaches, whether declared directly or
 * contributed by a Pack, each resolved to its canonical package root. The
 * set is proven complete for that type before any contributor is resolved.
 * A caller that decodes each contributor's manifest itself may ask for the
 * manifest each observation read, and a caller that hashes a contributor's
 * package may ask that contributor's observation for that hash.
 */
export const activeContributors = (args: {
  readonly layout: WorkspaceLayout;
  readonly type: ExtensionType;
  readonly graph: DesiredStateGraph;
  readonly accepted: Readonly<Record<string, LockEntry>>;
  readonly captureManifests?: true;
  /** Whether a contributor's observation also frames its package content hash. */
  readonly captureContentHashFor?: (node: DesiredExtensionNode) => boolean;
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
        contributorForNode({
          layout: args.layout,
          node,
          accepted: args.accepted[node.name],
          captureManifests: args.captureManifests === true,
          captureContentHash: args.captureContentHashFor?.(node) === true,
        }),
      ),
    ),
  );
