/**
 * The desired-state graph: what one evaluation of the workspace's declared
 * intent derived, and the constraint vocabulary every planner reads from it.
 *
 * The graph is invocation-local evidence. `evaluateDesiredState` is its only
 * producer; the queries beside it answer reachability, contributor, and
 * problem questions with the evidence each answer rests on.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import type { PackRef } from "@agentxm/extension-model/unstable/extensions/refs/pack";
import { SETTINGS_FILENAME } from "@agentxm/extension-model/unstable/workspace-files";
import {
  intersectVersionConstraints,
  VersionRangeSchema,
  type VersionRange,
} from "@agentxm/extension-model/unstable/version-constraints";
import {
  desiredMcpSourceKey,
  type DesiredNodeIdentity,
  type DesiredPackIdentity,
  type DesiredSourceAuthority,
} from "./desired-identity.js";
import type { PackManifestSchemaIssue } from "./pack-manifests.js";

export type DesiredExtensionOrigin =
  | {
      readonly type: "settings";
      readonly localName?: string;
      readonly authority?: "sourced";
      readonly source: string;
      readonly enabled: boolean;
      readonly constraint?: string;
    }
  | {
      readonly type: "settings";
      readonly localName?: string;
      readonly authority: "inline";
      readonly source?: undefined;
      readonly constraint?: undefined;
      readonly enabled: boolean;
    }
  | {
      readonly type: "pack";
      /** The Pack that declares this member. */
      readonly pack: DesiredPackIdentity;
      readonly manifestPath: string;
      readonly source: string;
      /** The source the member is acquired from: declared by the Pack, or inherited from it. */
      readonly sourceAuthority?: DesiredSourceAuthority;
      readonly constraint: string;
      readonly enabled: boolean;
    };

/**
 * A preference a settings entry expresses about a Pack-supplied member.
 *
 * It is deliberately not a `DesiredExtensionOrigin`: a preference declares no
 * acquisition, so it must never satisfy a check that asks whether settings
 * declared this extension. It contributes no constraint and no source.
 */
export interface DesiredMemberPreference {
  readonly localName: string;
  readonly location: string;
  readonly enabled?: boolean;
  readonly instructionEntry?: boolean;
  readonly env?: Readonly<Record<string, string>>;
}

interface DesiredExtensionNodeCommon {
  readonly type: ExtensionType;
  readonly name: string;
  /** Who is authoritative for the package this node names, and its name there. */
  readonly identity: DesiredNodeIdentity;
  readonly enabled: boolean;
  readonly origins: ReadonlyArray<DesiredExtensionOrigin>;
  /** Present when a source-less settings entry configures this member. */
  readonly preference?: DesiredMemberPreference;
}

/**
 * A node before its effective constraint is settled: what the evaluator
 * merges candidates into, and what `effectiveDesiredConstraint` reads.
 */
export type SettledExtensionNode = DesiredExtensionNodeCommon &
  (
    | { readonly authority?: "sourced"; readonly source: string }
    | {
        readonly type: "mcp-server";
        readonly authority: "inline";
        readonly source?: undefined;
      }
  );

/**
 * A desired node. `source` is the locator the workspace declared for it (the
 * direct declaration's when there is one, else the first Pack route's by Pack
 * name); the range it is selected within is `constraint`, the effective
 * constraint the graph owns, or the conflict that names every contributor.
 */
export type DesiredExtensionNode = SettledExtensionNode & {
  readonly constraint: Result.Result<DesiredEffectiveConstraint, DesiredConstraintConflict>;
};

/** The effective constraint of a node nothing constrains. */
export const UNCONSTRAINED_DESIRED_NODE: DesiredExtensionNode["constraint"] = Result.succeed({
  range: Option.none(),
  contributors: [],
});

export const isInlineDesiredExtension = <N extends SettledExtensionNode>(
  node: N,
): node is N & { readonly authority: "inline" } => node.authority === "inline";

export const isSourcedDesiredExtension = <N extends SettledExtensionNode>(
  node: N,
): node is N & { readonly source: string } => node.authority !== "inline";

export interface DesiredConstraintContributor {
  readonly source: "settings" | "pack";
  readonly range: string;
  readonly location: string;
  readonly dependingPack?: string;
  readonly localName?: string;
}

export type DesiredStateProblem =
  | {
      readonly type: "workspace-owner-missing";
      readonly extensionType: ExtensionType;
      readonly name: string;
    }
  | {
      /** The document could not be observed: it is absent, or an I/O failure hid it. */
      readonly type: "pack-manifest-unavailable";
      readonly pack: string;
      readonly path: string;
      readonly reason: "absent" | "unreadable";
      /** The normalized I/O failure, when one hid the document. */
      readonly cause?: string;
    }
  | ({
      /** The document was read but is not a Pack manifest. */
      readonly type: "pack-manifest-invalid";
      readonly pack: string;
      readonly path: string;
    } & (
      | { readonly reason: "malformed" }
      | {
          readonly reason: "schema-invalid";
          readonly issues: ReadonlyArray<PackManifestSchemaIssue>;
        }
    ))
  | {
      readonly type: "pack-identity-mismatch";
      readonly pack: string;
      readonly path: string;
      readonly detail: string;
    }
  | {
      readonly type: "pack-resolution-unavailable";
      readonly pack: string;
      readonly detail: string;
    }
  | {
      readonly type: "pack-manifest-content-mismatch";
      readonly pack: string;
      readonly path: string;
      readonly status: "changed";
      readonly acceptedVersion: string;
      readonly acceptedContentIdentity: string;
      readonly observedVersion: string;
      readonly observedContentIdentity: string;
    }
  | {
      /** Every identity competing for one local name; the graph represents one and retains the rest. */
      readonly type: "projection-collision";
      readonly extensionType: ExtensionType;
      readonly name: string;
      readonly identities: ReadonlyArray<DesiredNodeIdentity>;
    }
  | {
      readonly type: "constraint-conflict";
      readonly extensionType: ExtensionType;
      readonly name: string;
      readonly constraints: ReadonlyArray<string>;
      readonly contributors: ReadonlyArray<DesiredConstraintContributor>;
    }
  | {
      /**
       * A source-less settings entry configures a member no configured Pack
       * supplies under that local name. The entry cannot be repaired by
       * guessing a source, so it is reported rather than silently ignored.
       */
      readonly type: "member-configuration-unbound";
      readonly extensionType: ExtensionType;
      readonly name: string;
      readonly location: string;
    };

/** Contributors whose ranges share no version: a blocker every planner reports unchanged. */
export type DesiredConstraintConflict = Extract<
  DesiredStateProblem,
  { readonly type: "constraint-conflict" }
>;

/** The one range a desired node is selected within, and every contributor that decided it. */
export interface DesiredEffectiveConstraint {
  /** The intersection of every contributor's range; none when nothing constrains the node. */
  readonly range: Option.Option<VersionRange>;
  readonly contributors: ReadonlyArray<DesiredConstraintContributor>;
}

/** A member a Pack manifest declares. */
export interface DesiredMemberSubject {
  readonly type: Exclude<ExtensionType, "pack">;
  readonly name: string;
}

/** Why a configured Pack's declared membership could not be established. */
export type DesiredMembershipUnknownReason =
  "unidentified" | "absent" | "unreadable" | "malformed" | "schema-invalid" | "identity-mismatch";

/**
 * Whether a Pack's declared members contribute routes to the effective
 * graph: they do, the Pack is disabled so they lie dormant, the accepted
 * resolution cannot authorize the manifest so they are withheld, or the
 * membership itself is unknown.
 */
export type DesiredPackRoutes = "active" | "dormant" | "unauthorized" | "unknown";

/** What one evaluation knows about one configured Pack's membership. */
export interface DesiredPackMembership {
  readonly settingsName: string;
  /** The Pack's fully qualified name, or its configured source when it cannot be identified. */
  readonly pack: string;
  readonly enabled: boolean;
  readonly declared:
    | { readonly status: "known"; readonly members: ReadonlyArray<DesiredMemberSubject> }
    | { readonly status: "unknown"; readonly reason: DesiredMembershipUnknownReason };
  readonly routes: DesiredPackRoutes;
}

export interface DesiredStateGraph {
  readonly nodes: ReadonlyArray<DesiredExtensionNode>;
  readonly mcpSourceClosures: ReadonlyArray<DesiredMcpSourceClosure>;
  readonly problems: ReadonlyArray<DesiredStateProblem>;
  /** One record per configured Pack, by Pack name. */
  readonly packMembership: ReadonlyArray<DesiredPackMembership>;
}

/** Every local MCP connection to one source, which share one accepted resolution. */
export interface DesiredMcpSourceClosure {
  /** The key the closure's resolution is recorded under; see {@link desiredMcpSourceKey}. */
  readonly key: string;
  readonly localNames: ReadonlyArray<string>;
  readonly origins: ReadonlyArray<DesiredExtensionOrigin>;
}

export type ProspectivePackRef = Pick<PackRef, "owner" | "pack" | "version">;

const sortConstraintContributors = (
  contributors: ReadonlyArray<DesiredConstraintContributor>,
): ReadonlyArray<DesiredConstraintContributor> =>
  [...contributors].sort((left, right) => {
    const byPack = (left.dependingPack ?? "").localeCompare(right.dependingPack ?? "");
    if (byPack !== 0) return byPack;
    const byRange = left.range.localeCompare(right.range);
    return byRange === 0 ? left.location.localeCompare(right.location) : byRange;
  });

export const collectDesiredConstraintContributors = (
  origins: ReadonlyArray<DesiredExtensionOrigin>,
): ReadonlyArray<DesiredConstraintContributor> =>
  sortConstraintContributors(
    origins.flatMap((origin): ReadonlyArray<DesiredConstraintContributor> => {
      if (origin.type === "settings" && origin.authority === "inline") return [];
      if (origin.constraint === undefined) return [];
      if (origin.type === "settings") {
        return [
          {
            source: "settings",
            range: origin.constraint,
            location: SETTINGS_FILENAME,
            ...(origin.localName === undefined ? {} : { localName: origin.localName }),
          },
        ];
      }
      return [
        {
          source: "pack",
          dependingPack: origin.pack.fqn,
          range: origin.constraint,
          location: origin.manifestPath,
        },
      ];
    }),
  );

/**
 * One owner's contribution after a change a planner is about to make: the
 * direct declaration for a local name, or a Pack. A direct declaration the
 * change rewrites without a range contributes nothing afterwards.
 */
export type DesiredConstraintProposal =
  | DesiredConstraintContributor
  | { readonly source: "settings"; readonly localName: string; readonly range?: undefined };

const contributorOwner = (contributor: DesiredConstraintProposal): string =>
  contributor.source === "pack"
    ? `pack:${contributor.dependingPack ?? ""}`
    : `settings:${contributor.localName ?? ""}`;

const isContributor = (
  proposal: DesiredConstraintProposal,
): proposal is DesiredConstraintContributor => proposal.range !== undefined;

const decodeRange = Schema.decodeUnknownOption(VersionRangeSchema);

/** Intersect every contributor for one subject; the only combination rule the graph applies. */
const combineConstraintContributors = (
  subject: { readonly extensionType: ExtensionType; readonly name: string },
  contributors: ReadonlyArray<DesiredConstraintContributor>,
): Result.Result<DesiredEffectiveConstraint, DesiredConstraintConflict> => {
  const constraints = [...new Set(contributors.map((contributor) => contributor.range))];
  const intersection = intersectVersionConstraints(constraints);
  // One distinct range is its own intersection, and reads as it was declared.
  const range =
    intersection === undefined
      ? Option.none()
      : Option.orElse(constraints.length === 1 ? decodeRange(constraints[0]) : Option.none(), () =>
          decodeRange(intersection),
        );
  if (Option.isNone(range)) {
    return Result.fail({
      type: "constraint-conflict",
      extensionType: subject.extensionType,
      name: subject.name,
      constraints,
      contributors,
    });
  }
  return Result.succeed({
    range: contributors.length === 0 ? Option.none() : range,
    contributors,
  });
};

/**
 * Settle the effective constraint for one subject from contributors stated
 * directly: the same intersection the graph applies to a node's routes, for
 * callers that assemble a node without building a graph.
 */
export const settleDesiredConstraint = (
  subject: { readonly extensionType: ExtensionType; readonly name: string },
  contributors: ReadonlyArray<DesiredConstraintContributor>,
): Result.Result<DesiredEffectiveConstraint, DesiredConstraintConflict> =>
  combineConstraintContributors(subject, sortConstraintContributors(contributors));

/**
 * The effective constraint a node's own routes settle to, for a node
 * assembled outside the evaluator (a sourced MCP node settles through its
 * closure only inside a graph).
 */
export const settleDesiredNodeConstraint = (
  node: Pick<SettledExtensionNode, "type" | "name" | "origins">,
): Result.Result<DesiredEffectiveConstraint, DesiredConstraintConflict> =>
  settleDesiredConstraint(
    { extensionType: node.type, name: node.name },
    collectDesiredConstraintContributors(node.origins),
  );

/**
 * The effective constraint for one desired node: the intersection of every
 * contributor — its direct declaration and every Pack that requires it — or
 * the conflict that names them all. This is the only place direct and Pack
 * contributors combine; planners select within the range it returns and
 * block on the conflict it reports.
 *
 * A sourced MCP server's contributors are its whole source-resolution
 * closure, because every local connection to one source shares a resolution.
 *
 * `proposed` contributions describe a change a planner is about to make: each
 * one replaces the graph's contributors with the same owner — the direct
 * declaration for that local name, or that Pack — so a planner asks what the
 * constraint becomes after its own change without publishing it. A target
 * the graph does not desire is constrained by its proposed contributors
 * only, except that a prospective MCP connection naming a source `identity`
 * joins that source's closure and is constrained by it as well.
 */
export const effectiveDesiredConstraint = (
  graph: {
    readonly nodes: ReadonlyArray<SettledExtensionNode>;
    readonly mcpSourceClosures: ReadonlyArray<DesiredMcpSourceClosure>;
  },
  target: {
    readonly type: ExtensionType;
    readonly name: string;
    /** The source a prospective MCP connection joins, when it is not yet desired. */
    readonly sourceKey?: string;
  },
  proposed: ReadonlyArray<DesiredConstraintProposal> = [],
): Result.Result<DesiredEffectiveConstraint, DesiredConstraintConflict> => {
  const node = graph.nodes.find(
    (candidate) => candidate.type === target.type && candidate.name === target.name,
  );
  const closureKey =
    target.type !== "mcp-server"
      ? undefined
      : node === undefined
        ? target.sourceKey
        : isSourcedDesiredExtension(node)
          ? desiredMcpSourceKey(node.identity)
          : undefined;
  const closure =
    closureKey === undefined
      ? undefined
      : graph.mcpSourceClosures.find((candidate) => candidate.key === closureKey);
  const replaced = new Set(proposed.map(contributorOwner));
  const current = collectDesiredConstraintContributors(
    closure?.origins ?? node?.origins ?? [],
  ).filter((contributor) => !replaced.has(contributorOwner(contributor)));
  return combineConstraintContributors(
    {
      extensionType: target.type,
      name:
        closure === undefined
          ? target.name
          : [...new Set([...closure.localNames, target.name])].sort().join(", "),
    },
    sortConstraintContributors([...current, ...proposed.filter(isContributor)]),
  );
};

/**
 * A node's origins apart from the excluded Packs, named by fully qualified
 * name: an authored Pack and a Registry Pack of that name are one Pack.
 */
export const originsOutsidePacks = (
  node: Pick<DesiredExtensionNode, "origins">,
  excluding: Iterable<string>,
): ReadonlyArray<DesiredExtensionOrigin> => {
  const excluded = new Set(excluding);
  return node.origins.filter((origin) => origin.type !== "pack" || !excluded.has(origin.pack.fqn));
};

/**
 * Whether something other than the excluded Packs still requires this node:
 * its direct declaration or another Pack. Removing, replacing, or disabling
 * the excluded Packs leaves such a node desired, so it is retained rather
 * than retired.
 */
export const isRequiredByAnotherOrigin = (
  node: Pick<DesiredExtensionNode, "origins">,
  excluding: Iterable<string>,
): boolean => originsOutsidePacks(node, excluding).length > 0;
