/**
 * Evidence-bearing queries over one desired-state evaluation.
 *
 * Every consumer that decides retention, aggregate rendering, or safety asks
 * one of these rather than reading a completeness boolean: a negative answer
 * names the proof it rests on, and an answer that cannot be given names the
 * Pack whose routes are unresolved. Uncertainty never proves absence.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as crypto from "node:crypto";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions/common";
import type {
  DesiredExtensionNode,
  DesiredPackMembership,
  DesiredStateGraph,
  DesiredStateProblem,
} from "./desired-state-graph.js";

/** What one problem is about: a configured Pack, or one desired extension. */
export type DesiredProblemSubject =
  | { readonly kind: "pack"; readonly pack: string }
  | { readonly kind: "extension"; readonly type: ExtensionType; readonly name: string };

/** The typed subject of a problem; consumers never infer scope from a type-name prefix. */
export const desiredProblemSubject = (problem: DesiredStateProblem): DesiredProblemSubject => {
  switch (problem.type) {
    case "pack-manifest-unavailable":
    case "pack-manifest-invalid":
    case "pack-identity-mismatch":
    case "pack-resolution-unavailable":
    case "pack-manifest-content-mismatch":
      return { kind: "pack", pack: problem.pack };
    case "projection-collision":
    case "constraint-conflict":
    case "workspace-owner-missing":
    case "member-configuration-unbound":
      return { kind: "extension", type: problem.extensionType, name: problem.name };
  }
};

/** The problems about one desired extension. */
export const problemsAffectingSubject = (
  graph: Pick<DesiredStateGraph, "problems">,
  subject: { readonly type: ExtensionType; readonly name: string },
): ReadonlyArray<DesiredStateProblem> =>
  graph.problems.filter((problem) => {
    const about = desiredProblemSubject(problem);
    return about.kind === "extension" && about.type === subject.type && about.name === subject.name;
  });

/** The problems about any desired extension of one type. */
export const problemsAffectingType = (
  graph: Pick<DesiredStateGraph, "problems">,
  type: ExtensionType,
): ReadonlyArray<DesiredStateProblem> =>
  graph.problems.filter((problem) => {
    const about = desiredProblemSubject(problem);
    return about.kind === "extension" && about.type === type;
  });

/** The problems about one configured Pack, by fully qualified name. */
export const problemsAffectingPack = (
  graph: Pick<DesiredStateGraph, "problems">,
  pack: string,
): ReadonlyArray<DesiredStateProblem> =>
  graph.problems.filter((problem) => {
    const about = desiredProblemSubject(problem);
    return about.kind === "pack" && about.pack === pack;
  });

/**
 * The active Packs whose routes could not be established: their membership
 * is unknown, or their manifest is known but its routes are unauthorized
 * until the accepted resolution is repaired. While any such Pack exists,
 * no route through it can be ruled out, so every decision that would act on
 * an extension's absence from the graph waits.
 */
export const unresolvedPackRoutes = (
  graph: Pick<DesiredStateGraph, "packMembership">,
): ReadonlyArray<DesiredPackMembership> =>
  graph.packMembership.filter((membership) => membership.enabled && membership.routes !== "active");

/** Whether every configured Pack's declared membership is known, active or not. */
export const desiredMembershipKnown = (graph: Pick<DesiredStateGraph, "packMembership">): boolean =>
  graph.packMembership.every((membership) => membership.declared.status === "known");

/** Stable text naming each unresolved Pack and why its routes are unresolved. */
export const unresolvedPackRoutesText = (routes: ReadonlyArray<DesiredPackMembership>): string =>
  routes
    .map((membership) =>
      membership.declared.status === "unknown"
        ? `${membership.pack}: membership unknown (${membership.declared.reason})`
        : `${membership.pack}: routes unauthorized`,
    )
    .join("; ");

/** The least a graph view must carry to answer reachability. */
interface DesiredSubjectNode {
  readonly type: ExtensionType;
  readonly name: string;
}

/** Whether desired state reaches one extension, with the evidence the answer rests on. */
export type DesiredReachability<Node extends DesiredSubjectNode = DesiredExtensionNode> =
  | { readonly decision: "reached"; readonly node: Node }
  | { readonly decision: "not-reached" }
  | {
      /** Absence cannot be proved: an active Pack's routes are unresolved. */
      readonly decision: "unknown";
      readonly blockers: ReadonlyArray<DesiredPackMembership>;
    };

/**
 * Whether desired state reaches one extension. A desired node proves the
 * positive answer whatever its constraint settles to; the negative answer
 * needs every active Pack's routes established, because an unresolved Pack
 * could still route the extension.
 */
export const desiredReachability = <Node extends DesiredSubjectNode>(
  graph: {
    readonly nodes: ReadonlyArray<Node>;
    readonly packMembership: ReadonlyArray<DesiredPackMembership>;
  },
  subject: DesiredSubjectNode,
): DesiredReachability<Node> => {
  const node = graph.nodes.find(
    (candidate) => candidate.type === subject.type && candidate.name === subject.name,
  );
  if (node !== undefined) return { decision: "reached", node };
  const blockers = unresolvedPackRoutes(graph);
  return blockers.length === 0 ? { decision: "not-reached" } : { decision: "unknown", blockers };
};

/** What stops one extension type's contributor set from being complete. */
export interface DesiredContributorBlockers {
  /** Active Packs whose members of this type cannot be enumerated. */
  readonly routes: ReadonlyArray<DesiredPackMembership>;
  /** Problems about an extension of this type. */
  readonly problems: ReadonlyArray<DesiredStateProblem>;
}

/**
 * Whether the whole contributor set for one extension type is known and
 * every contributor is valid. An aggregate unit renders from this set or not
 * at all; a problem about another type does not block it.
 */
export const contributorSetBlockers = (
  graph: Pick<DesiredStateGraph, "problems" | "packMembership">,
  type: ExtensionType,
): DesiredContributorBlockers => ({
  routes: unresolvedPackRoutes(graph),
  problems: problemsAffectingType(graph, type),
});

/** Whether a contributor-set answer has no blockers. */
export const contributorSetComplete = (blockers: DesiredContributorBlockers): boolean =>
  blockers.routes.length === 0 && blockers.problems.length === 0;

/**
 * The inspection summary: whether the evaluation reported no problem at all.
 * This is a display fact, not a decision — an operation asks the query that
 * matches the decision it is about to make.
 */
export const desiredStateSettled = (graph: Pick<DesiredStateGraph, "problems">): boolean =>
  graph.problems.length === 0;

/**
 * The semantic identity of one evaluation: equal exactly when the nodes,
 * closures, problems, and membership knowledge are equal. Display-only
 * sentences are excluded, so rewording a diagnostic does not read as a
 * change in desired state.
 */
export const desiredStateIdentity = (graph: DesiredStateGraph): string =>
  crypto
    .createHash("sha256")
    .update(
      JSON.stringify(
        {
          nodes: graph.nodes,
          mcpSourceClosures: graph.mcpSourceClosures,
          problems: graph.problems,
          packMembership: graph.packMembership,
        },
        (key, value: unknown) => (key === "detail" ? undefined : value),
      ),
    )
    .digest("hex");
