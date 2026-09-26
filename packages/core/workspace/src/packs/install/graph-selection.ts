/**
 * Selecting one Pack graph: the workspace source authority a Pack's members
 * are judged against, the constraint gate over the proposed desired-state
 * graph, and each member's release under one release-age evaluation.
 * Install, update, and sync recovery render this one decision, and every
 * refusal it raises is the kernel's install refusal.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type { PackRef } from "@agentxm/extension-model/unstable/extensions/refs/pack";
import {
  parseExtensionFqnParts,
  packMemberRegistrySource,
  packMemberVersionRange,
  toExtensionTypePlural,
} from "@agentxm/extension-model/unstable/extensions";
import type { ReleaseAgeEvaluation } from "@agentxm/extension-model/unstable/extensions/release-age";
import { isWorkspaceSourceLocator } from "@agentxm/extension-model/unstable/sources/workspace";
import {
  versionSatisfiesRange,
  type VersionRange,
} from "@agentxm/extension-model/unstable/version-constraints";
import {
  DesiredStateReader,
  LockfileReader,
  SettingsReader,
  WorkspaceLocation,
  desiredIdentityOfRef,
  desiredPackageKey,
  effectiveDesiredConstraint,
  formatDesiredSourceAuthority,
  observeDesiredCanonical,
  packMemberSourceAuthority,
  usableAcceptedCanonical,
  usableAcceptedCanonicalFrom,
  type DesiredConstraintConflict,
  type DesiredExtensionNode,
  type DesiredExtensionOrigin,
  type DesiredStateGraph,
} from "../../desired-state/index.js";
import {
  installRefused,
  type ExtensionLifecycleFailed,
  type ReleaseAgeBypassRecord,
  type ReleaseAgeHoldbackRecord,
} from "../../operations/index.js";
import { makeExtensionConstraintInvariantFact } from "../../projection/index.js";
import {
  evaluateSourceAuthority,
  type HeldReleasePolicy,
  type PackMemberRangeResolver,
  type SourceAuthorityBlockedFact,
  type WorkspacePackDependencyResolver,
} from "../../resolution/index.js";
import { SourceHostProviders } from "../../resolution/sources/index.js";
import type { PackRecoveryDependencyResolver } from "../../reconciliation/index.js";
import type { AcceptedMemberMismatch } from "../lifecycle/constraint-gate.js";
import { expandPackInstallRefsWithReleaseAge } from "../lifecycle/expansion.js";

/** What selecting one Pack graph reads from the intent that asked for it. */
export interface PackGraphSelectionRequest {
  readonly packToInstall: PackRef;
  readonly versionRange: Option.Option<VersionRange>;
  /** The one evaluation every member is selected under. */
  readonly releaseAgeEvaluation: ReleaseAgeEvaluation;
  /** The policy the operation that classified this intent declared. */
  readonly heldRelease: HeldReleasePolicy;
  /** Immutable dependency authority a deterministic recovery workflow supplies. */
  readonly dependencyResolver?: PackRecoveryDependencyResolver;
  /**
   * The proposed desired-state graph whose effective constraints the members
   * are selected within. A sweep that advances several Packs builds it once
   * with every selected Pack's manifest; omitted, this Pack's manifest is the
   * only proposed change.
   */
  readonly desiredGraph?: DesiredStateGraph;
}

/** The desired state as it would be with these Pack manifests, before anything is written. */
export const readProposedGraph = (prospectivePacks: ReadonlyArray<PackRef>) =>
  Effect.flatMap(DesiredStateReader, (desiredState) =>
    // With no proposed manifest the proposal is the current desired state.
    desiredState.graph(prospectivePacks.length === 0 ? undefined : { prospectivePacks }).pipe(
      Effect.mapError((cause) =>
        installRefused({
          category: "internal",
          detail: "Proposed desired state could not be read",
          cause,
        }),
      ),
    ),
  );

const readDesiredGraph = Effect.gen(function* () {
  const desiredState = yield* DesiredStateReader;
  return yield* desiredState
    .graph()
    .pipe(
      Effect.mapError((cause) =>
        installRefused({ category: "internal", detail: "Desired state could not be read", cause }),
      ),
    );
});

/**
 * Which declared members a locally-authored workspace package may satisfy,
 * and which configured sources refuse to be replaced by the registry. The
 * fingerprint identifies the exact authority this plan was built against, so
 * the transition can refuse a candidate that went stale.
 */
export interface WorkspaceAuthorityScan {
  readonly graph: DesiredStateGraph;
  readonly blockers: ReadonlyArray<SourceAuthorityBlockedFact>;
  readonly workspaceResolver: WorkspacePackDependencyResolver;
  readonly fingerprint: string;
}

/** What reading workspace source authority and accepted canonical content needs. */
type WorkspaceAuthorityRequirements =
  | FileSystem.FileSystem
  | Path.Path
  | WorkspaceLocation
  | SettingsReader
  | LockfileReader
  | DesiredStateReader;

export const scanWorkspaceAuthority: (
  pack: PackRef,
) => Effect.Effect<
  WorkspaceAuthorityScan,
  ExtensionLifecycleFailed,
  WorkspaceAuthorityRequirements
> = Effect.fn("InstallExtensions.scanWorkspaceAuthority")(function* (pack: PackRef) {
  const graph = yield* readDesiredGraph;
  const path = yield* Path.Path;
  const { baseDir } = yield* WorkspaceLocation;
  const packIdentity = `${pack.owner}/packs/${pack.name}`;
  const blockers: Array<SourceAuthorityBlockedFact> = [];
  const workspaceRefs = new Map<string, ExtensionRef>();

  const root = graph.nodes.find(
    (node) =>
      node.type === "pack" &&
      node.name === pack.name &&
      node.origins.some(
        (origin) =>
          origin.type === "settings" &&
          origin.source !== undefined &&
          isWorkspaceSourceLocator(origin.source),
      ),
  );
  if (root !== undefined) {
    const decision = evaluateSourceAuthority({
      target: { type: "pack", name: pack.name, identity: packIdentity },
      relationship: { kind: "root" },
      requested: desiredIdentityOfRef(pack),
      configured: { identity: root.identity },
    });
    if (decision.kind === "blocked") blockers.push(decision.fact);
  }

  const dependencies = Object.entries(pack.pack.dependencies).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  for (const [fqn, declaration] of dependencies) {
    const parsed = parseExtensionFqnParts(fqn);
    if (parsed === undefined || parsed.type === "pack") continue;
    const declaredSource = packMemberRegistrySource(declaration);
    const existing = graph.nodes.find(
      (node) => node.type === parsed.type && node.name === parsed.name,
    );
    const existingPackOrigins = (existing?.origins ?? []).flatMap((origin) =>
      origin.type === "pack" && origin.pack.fqn !== packIdentity ? [origin] : [],
    );
    // The requested spelling and the held one come from one producer, so a
    // second Pack from the same source view is never a source conflict.
    const requestedAuthority = formatDesiredSourceAuthority(
      declaredSource === undefined
        ? packMemberSourceAuthority({ kind: "resolved", source: pack.source, path, baseDir })
        : { authority: "registry", endpoint: declaredSource.url },
    );
    const heldAuthority = (origin: Extract<DesiredExtensionOrigin, { readonly type: "pack" }>) =>
      origin.sourceAuthority === undefined
        ? origin.source
        : formatDesiredSourceAuthority(origin.sourceAuthority);
    const existingPackDeclarations = existingPackOrigins.map(
      (origin) => `${origin.pack.fqn} declares ${fqn} from ${heldAuthority(origin)}`,
    );
    if (existingPackDeclarations.length > 0) {
      const heldAuthorities = [...new Set(existingPackOrigins.map(heldAuthority))];
      if (heldAuthorities.some((authority) => authority !== requestedAuthority)) {
        const declarations = [
          ...existingPackDeclarations,
          `${packIdentity} declares ${fqn} from ${requestedAuthority}`,
        ];
        blockers.push({
          id: `pack-authority:member:${fqn}:source-conflict`,
          target: { type: parsed.type, name: parsed.name, identity: fqn },
          relationship: { kind: "member", root: packIdentity },
          requestedSource: requestedAuthority,
          configuredSource: heldAuthorities.join(", "),
          cause: "pack-source-conflict",
          detail: `Pack member ${fqn} is held by ${heldAuthorities.join(", ")}; conflicting declarations: ${declarations.join(", ")}`,
          recovery: [
            {
              description:
                "Remove or transition the conflicting Pack declaration before installing this Pack; Pack member authority has no override flag.",
            },
          ],
        });
        continue;
      }
    }

    const desired = graph.nodes.find(
      (node) =>
        node.type === parsed.type &&
        node.name === parsed.name &&
        node.origins.some(
          (origin) =>
            origin.type === "settings" &&
            origin.source !== undefined &&
            isWorkspaceSourceLocator(origin.source),
        ),
    );
    if (desired === undefined) continue;

    // One observation judges the configured workspace package; its usable
    // ref is read from that observation rather than by observing again.
    const canonical = yield* observeDesiredCanonical(desired).pipe(
      Effect.flatMap((observed) =>
        Effect.map(usableAcceptedCanonicalFrom(observed), (usable) => ({
          status: observed.observation.status,
          usable,
        })),
      ),
      Effect.mapError((cause) =>
        installRefused({
          category: "internal",
          detail: `Accepted canonical content for ${parsed.name} could not be inspected`,
          cause,
        }),
      ),
    );
    const targetIdentity = `${parsed.owner}/${toExtensionTypePlural(parsed.type)}/${parsed.name}`;
    const decision = evaluateSourceAuthority({
      target: { type: parsed.type, name: parsed.name, identity: targetIdentity },
      relationship: { kind: "member" as const, root: packIdentity },
      requested: {
        authority: "registry",
        fqn: targetIdentity,
        registry: {
          sourceName: undefined,
          endpoint: declaredSource === undefined ? undefined : declaredSource.url,
        },
      },
      configured: { identity: desired.identity, status: canonical.status },
    });
    if (decision.kind === "blocked") {
      blockers.push(decision.fact);
      continue;
    }
    if (decision.kind !== "workspace-satisfied" || Option.isNone(canonical.usable)) continue;
    const ref = canonical.usable.value.ref;
    workspaceRefs.set(`${parsed.type}:${parsed.owner}/${parsed.name}`, ref);
  }

  const workspaceResolver: WorkspacePackDependencyResolver = ({ owner, type, name }) =>
    Effect.succeed(
      Option.match(Option.fromUndefinedOr(workspaceRefs.get(`${type}:${owner}/${name}`)), {
        onNone: () => ({ kind: "absent" as const }),
        onSome: (ref) => ({ kind: "selected" as const, ref }),
      }),
    );
  const fingerprint = [...workspaceRefs.entries()]
    .map(([key, ref]) =>
      ref.refType === "workspace" ? `${key}:${ref.version}:${ref.sourceHash}` : key,
    )
    .sort()
    .join("|");
  return { graph, blockers, workspaceResolver, fingerprint };
});

/**
 * The range each member of this Pack is selected within: the proposed
 * graph's effective constraint for the member, with this Pack's declared
 * range standing in for whatever the graph holds for the same Pack. Every
 * other contributor — the member's direct declaration and every other Pack
 * that requires it — still applies.
 */
const packMemberEffectiveConstraint = (
  pack: PackRef,
  graph: DesiredStateGraph,
  member: {
    readonly type: Exclude<DesiredExtensionNode["type"], "pack">;
    readonly name: string;
    readonly declared: VersionRange;
  },
) => {
  const packIdentity = `${pack.owner}/packs/${pack.pack.name}`;
  const location =
    graph.nodes
      .find((node) => node.type === member.type && node.name === member.name)
      ?.origins.flatMap((origin) =>
        origin.type === "pack" && origin.pack.fqn === packIdentity ? [origin.manifestPath] : [],
      )
      .at(0) ?? packIdentity;
  return effectiveDesiredConstraint(graph, { type: member.type, name: member.name }, [
    { source: "pack", dependingPack: packIdentity, range: member.declared, location },
  ]);
};

export const packMemberRangeResolver =
  (pack: PackRef, graph: DesiredStateGraph): PackMemberRangeResolver =>
  ({ type, name, declared }) =>
    Result.map(packMemberEffectiveConstraint(pack, graph, { type, name, declared }), (effective) =>
      Option.getOrElse(effective.range, () => declared),
    );

/** Every declared member of this Pack whose effective constraint is a conflict. */
export const packMemberConflicts = (
  pack: PackRef,
  graph: DesiredStateGraph,
): ReadonlyArray<DesiredConstraintConflict> => {
  const memberRange = packMemberRangeResolver(pack, graph);
  return Object.entries(pack.pack.dependencies).flatMap(([fqn, declaration]) => {
    const member = parseExtensionFqnParts(fqn);
    if (member === undefined || member.type === "pack") return [];
    const selected = memberRange({
      type: member.type,
      owner: member.owner,
      name: member.name,
      declared: packMemberVersionRange(declaration),
    });
    return Result.isFailure(selected) ? [selected.failure] : [];
  });
};

/**
 * Whether a release the minimum release age holds back may preserve the
 * current Pack graph: only when that graph is complete and the accepted Pack
 * and every one of its members are still usable. Otherwise there is nothing
 * to preserve, and a `preserve-or-block` operation blocks.
 */
export const heldPackGraphPreservable: (
  intent: Pick<PackGraphSelectionRequest, "packToInstall" | "versionRange">,
) => Effect.Effect<boolean, ExtensionLifecycleFailed, WorkspaceAuthorityRequirements> = Effect.fn(
  "InstallExtensions.heldPackGraphPreservable",
)(function* (intent: Pick<PackGraphSelectionRequest, "packToInstall" | "versionRange">) {
  const packIdentity = `${intent.packToInstall.owner}/packs/${intent.packToInstall.name}`;
  const graph = yield* readDesiredGraph;
  if (!graph.complete) return false;
  const currentPack = yield* usableAcceptedCanonical({
    type: "pack",
    name: intent.packToInstall.pack.name,
  }).pipe(
    Effect.mapError((cause) =>
      installRefused({
        category: "internal",
        detail: "Accepted pack content could not be inspected",
        cause,
      }),
    ),
  );
  if (
    Option.isNone(currentPack) ||
    currentPack.value.ref.refType !== "registry" ||
    currentPack.value.ref.owner !== intent.packToInstall.owner ||
    currentPack.value.ref.name !== intent.packToInstall.name ||
    (Option.isSome(intent.versionRange) &&
      !versionSatisfiesRange(currentPack.value.ref.version, intent.versionRange.value))
  ) {
    return false;
  }
  const nodes = graph.nodes.filter(
    (node) =>
      (node.type === "pack" && node.name === intent.packToInstall.pack.name) ||
      node.origins.some((origin) => origin.type === "pack" && origin.pack.fqn === packIdentity),
  );
  const usable = yield* Effect.forEach(nodes, (node) =>
    usableAcceptedCanonical({ type: node.type, name: node.name }).pipe(
      Effect.map(Option.isSome),
      Effect.mapError((cause) =>
        installRefused({
          category: "internal",
          detail: `Accepted content for ${node.name} could not be inspected`,
          cause,
        }),
      ),
    ),
  );
  return usable.every((value) => value);
});

/** Every member type a Pack may declare; a Pack never depends on another Pack. */
const PACK_MEMBER_TYPES = ["skill", "mcp-server", "subagent", "rule", "hook", "knowledge"] as const;

/** What selecting one Pack graph decided, before an operation renders it. */
export type PackGraphSelection =
  | {
      readonly kind: "authority-blocked";
      readonly blockers: ReadonlyArray<SourceAuthorityBlockedFact>;
    }
  | {
      readonly kind: "constraint-blocked";
      readonly conflicts: ReadonlyArray<DesiredConstraintConflict>;
    }
  | {
      /** A member's accepted resolution, replayed as its authority, falls outside its range. */
      readonly kind: "accepted-incompatible";
      readonly mismatch: AcceptedMemberMismatch;
    }
  | {
      readonly kind: "held";
      /** Whether the operation's held-release policy leaves the current graph standing. */
      readonly preserved: boolean;
      readonly holdbacks: ReadonlyArray<ReleaseAgeHoldbackRecord>;
      readonly bypasses: ReadonlyArray<ReleaseAgeBypassRecord>;
    }
  | {
      readonly kind: "selected";
      readonly authority: WorkspaceAuthorityScan;
      /** The desired state as it will be with this Pack's manifest in place. */
      readonly proposedGraph: DesiredStateGraph;
      /** The Pack first, then every member it resolves to. */
      readonly refs: ReadonlyArray<ExtensionRef>;
      readonly holdbacks: ReadonlyArray<ReleaseAgeHoldbackRecord>;
      readonly bypasses: ReadonlyArray<ReleaseAgeBypassRecord>;
    };

/**
 * Select one Pack graph the way every operation does: workspace source
 * authority first, then the constraint gate over the proposed desired-state
 * graph, then every member under the intent's release-age evaluation, with a
 * held release settled by the policy the intent's operation declared.
 * Install, update, and sync recovery render this one decision; none of them
 * re-implements a step of it.
 */
export const selectPackGraph = Effect.fn("InstallExtensions.selectPackGraph")(function* (
  intent: PackGraphSelectionRequest,
) {
  const sources = yield* SourceHostProviders;
  const authority = yield* scanWorkspaceAuthority(intent.packToInstall);
  if (authority.blockers.length > 0) {
    return { kind: "authority-blocked", blockers: authority.blockers } satisfies PackGraphSelection;
  }
  // Members are selected within the proposed graph's effective constraints;
  // a member no version can satisfy blocks the Pack before anything resolves.
  const proposedGraph = intent.desiredGraph ?? (yield* readProposedGraph([intent.packToInstall]));
  const conflicts = packMemberConflicts(intent.packToInstall, proposedGraph);
  if (conflicts.length > 0) {
    return { kind: "constraint-blocked", conflicts } satisfies PackGraphSelection;
  }
  const expansion = yield* expandPackInstallRefsWithReleaseAge({
    pack: intent.packToInstall,
    supportedDependencyTypes: PACK_MEMBER_TYPES,
    sources,
    releaseAgeEvaluation: intent.releaseAgeEvaluation,
    workspaceResolver: authority.workspaceResolver,
    memberRange: packMemberRangeResolver(intent.packToInstall, proposedGraph),
    ...(intent.dependencyResolver === undefined
      ? {}
      : { dependencyResolver: intent.dependencyResolver }),
  }).pipe(
    Effect.catchTag("AcceptedPackMemberIncompatible", (mismatch) =>
      Effect.succeed({ kind: "accepted-incompatible", mismatch } as const),
    ),
  );
  if (expansion.kind === "accepted-incompatible") {
    const { mismatch } = expansion;
    const declaration = Object.entries(intent.packToInstall.pack.dependencies).find(
      ([fqn]) => fqn === mismatch.dependencyTarget,
    )?.[1];
    const effective =
      declaration === undefined
        ? undefined
        : packMemberEffectiveConstraint(intent.packToInstall, proposedGraph, {
            type: mismatch.type,
            name: mismatch.name,
            declared: packMemberVersionRange(declaration),
          });
    // The fact is the one sync observes for the member's desired node, so
    // both routes state it identically.
    const member = proposedGraph.nodes.find(
      (node) => node.type === mismatch.type && node.name === mismatch.name,
    );
    const fact = makeExtensionConstraintInvariantFact(
      member ?? {
        type: mismatch.type,
        name: mismatch.name,
        identity: {
          authority: "registry",
          fqn: mismatch.dependencyTarget,
          registry: { sourceName: undefined, endpoint: undefined },
        },
      },
      {
        type: mismatch.type,
        name: mismatch.name,
        status: "constraint-mismatch",
        authority: {
          source: "desired-state-graph",
          identity:
            member === undefined ? mismatch.dependencyTarget : desiredPackageKey(member.identity),
          locator: member?.source ?? mismatch.dependencyTarget,
          constraints:
            effective === undefined || Result.isFailure(effective)
              ? []
              : effective.success.contributors,
        },
        acceptedVersion: mismatch.acceptedVersion,
      },
    );
    return {
      kind: "accepted-incompatible",
      mismatch: { fqn: mismatch.dependencyTarget, fact },
    } satisfies PackGraphSelection;
  }
  if (expansion.kind === "policy_held") {
    return {
      kind: "held",
      preserved: intent.heldRelease === "continue" || (yield* heldPackGraphPreservable(intent)),
      holdbacks: expansion.holdbacks,
      bypasses: expansion.bypasses,
    } satisfies PackGraphSelection;
  }
  return {
    kind: "selected",
    authority,
    proposedGraph,
    refs: expansion.refs,
    holdbacks: expansion.holdbacks,
    bypasses: expansion.bypasses,
  } satisfies PackGraphSelection;
});
