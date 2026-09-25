import * as Option from "effect/Option";

import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import { type PackRef } from "@agentxm/extension-model/unstable/extensions/refs/pack";
import {
  desiredStateProblemsText,
  type DesiredConstraintConflict,
  type DesiredExtensionOrigin,
  type DesiredStateGraph,
} from "../../desired-state/index.js";
import type { ExtensionConstraintInvariantFact } from "../../projection/index.js";
import { toTypedLabel } from "../../reconciliation/index.js";
import { operationPresentation, type Plan } from "../../transitions/planning/index.js";

import type { InstallStepRequirements } from "../../lifecycle/install/vocabulary.js";
import { desiredPackageKey } from "../../desired-state/index.js";

const packOrigins = (origins: ReadonlyArray<DesiredExtensionOrigin>): ReadonlyArray<string> =>
  origins.flatMap((origin) => (origin.type === "pack" ? [origin.pack.fqn] : []));

/**
 * Packs that share a member depend on the same resolution, so a change to one
 * is a change to the other's desired state. Adjacency is read off the
 * proposed graph, which already carries the membership the selection would
 * produce.
 */
const packAdjacency = (graph: DesiredStateGraph): ReadonlyMap<string, ReadonlySet<string>> => {
  const adjacent = new Map<string, Set<string>>();
  for (const node of graph.nodes) {
    const packs = packOrigins(node.origins);
    for (const pack of packs) {
      const neighbors = adjacent.get(pack) ?? new Set<string>();
      for (const peer of packs) {
        if (peer !== pack) neighbors.add(peer);
      }
      adjacent.set(pack, neighbors);
    }
  }
  return adjacent;
};

/** The Pack identities a selection names, whether prospective or already desired. */
const selectedPackIdentities = (
  graph: DesiredStateGraph,
  prospectivePacks: ReadonlyArray<PackRef>,
  selectedNames: ReadonlySet<string> | undefined,
): ReadonlySet<string> => {
  const selected = new Set(prospectivePacks.map((pack) => `${pack.owner}/packs/${pack.pack.name}`));
  for (const node of graph.nodes) {
    if (node.type === "pack" && (selectedNames === undefined || selectedNames.has(node.name))) {
      selected.add(desiredPackageKey(node.identity));
    }
  }
  return selected;
};

const reachableFrom = (
  seeds: Iterable<string>,
  adjacent: ReadonlyMap<string, ReadonlySet<string>>,
): ReadonlySet<string> => {
  const closure = new Set(seeds);
  const pending = [...closure];
  for (let index = 0; index < pending.length; index += 1) {
    const pack = pending[index];
    if (pack === undefined) continue;
    for (const neighbor of adjacent.get(pack) ?? []) {
      if (closure.has(neighbor)) continue;
      closure.add(neighbor);
      pending.push(neighbor);
    }
  }
  return closure;
};

const selectedPackClosure = (
  graph: DesiredStateGraph,
  prospectivePacks: ReadonlyArray<PackRef>,
  selectedNames: ReadonlySet<string> | undefined,
): ReadonlySet<string> =>
  reachableFrom(
    selectedPackIdentities(graph, prospectivePacks, selectedNames),
    packAdjacency(graph),
  );

/**
 * One set of selected Packs that has to settle together.
 *
 * Packs reach the same group when they share a member, because one proposed
 * member resolution has to satisfy every constraint on it. Packs in different
 * groups share no member, so neither group's validity depends on the other's:
 * a blocked group leaves a ready one free to commit.
 */
export interface PackUpdateGroup {
  /** Every Pack identity the group spans, selected or merely contributing. */
  readonly packIdentities: ReadonlyArray<string>;
  /** The selected Pack identities this group would advance. */
  readonly selectedPackIdentities: ReadonlyArray<string>;
  /** Constraint conflicts that block the whole group before any write. */
  readonly problems: ReadonlyArray<DesiredConstraintConflict>;
}

/**
 * Partition the selected Packs into the groups that must settle together and
 * attribute each constraint conflict to the group it blocks.
 */
export const packUpdateGroups = (args: {
  readonly graph: DesiredStateGraph;
  readonly prospectivePacks: ReadonlyArray<PackRef>;
  readonly selectedNames?: ReadonlySet<string>;
}): ReadonlyArray<PackUpdateGroup> => {
  const adjacent = packAdjacency(args.graph);
  const selected = selectedPackIdentities(args.graph, args.prospectivePacks, args.selectedNames);
  const grouped = new Set<string>();
  const groups: Array<PackUpdateGroup> = [];

  for (const identity of [...selected].sort()) {
    if (grouped.has(identity)) continue;
    const packIdentities = reachableFrom([identity], adjacent);
    for (const member of packIdentities) grouped.add(member);
    const problems = args.graph.problems.filter(
      (problem): problem is DesiredConstraintConflict =>
        problem.type === "constraint-conflict" &&
        problem.contributors.some(
          (contributor) =>
            contributor.dependingPack !== undefined &&
            packIdentities.has(contributor.dependingPack),
        ),
    );
    groups.push({
      packIdentities: [...packIdentities].sort(),
      selectedPackIdentities: [...packIdentities].filter((member) => selected.has(member)).sort(),
      problems,
    });
  }

  return groups;
};

export const relevantPackConstraintProblems = (args: {
  readonly graph: DesiredStateGraph;
  readonly prospectivePacks: ReadonlyArray<PackRef>;
  readonly selectedNames?: ReadonlySet<string>;
}): ReadonlyArray<DesiredConstraintConflict> => {
  const closure = selectedPackClosure(args.graph, args.prospectivePacks, args.selectedNames);
  return args.graph.problems.filter(
    (problem): problem is DesiredConstraintConflict =>
      problem.type === "constraint-conflict" &&
      problem.contributors.some(
        (contributor) =>
          contributor.dependingPack !== undefined && closure.has(contributor.dependingPack),
      ),
  );
};

/**
 * The machine-readable reference a constraint refusal carries.
 *
 * A contradiction between declared constraints is not resolved by running the
 * same command again, so consumers key on this to offer the choice the person
 * actually has rather than an unchanged retry.
 */
export const PACK_CONSTRAINT_CONFLICT_BLOCKER_ID = "pack-constraint-conflict";

/**
 * Refuse a group before its first write, and say which selected work the
 * refusal prevented.
 *
 * The deciding facts are stated once per prevented unit rather than folded
 * into a single anonymous failure, so a report can name every Pack the group
 * stopped without losing which constraints decided it.
 */
export const configuredPackConstraintBlockPlan = (args: {
  readonly operation: "install" | "update";
  readonly problems: ReadonlyArray<DesiredConstraintConflict>;
  /**
   * Display labels for the selected Packs the group prevented; omit for an
   * unattributed gate. These are the ledger's own labels, so a blocked row
   * reads in the same form as every other row beside it.
   */
  readonly blockedPackLabels?: ReadonlyArray<string>;
}): Plan<InstallStepRequirements> => {
  const deciding = desiredStateProblemsText(args.problems);
  const blocked = args.blockedPackLabels ?? [];
  const affected = blocked.length === 0 ? "" : `; prevented=${[...blocked].sort().join(", ")}`;
  const steps =
    blocked.length === 0
      ? [
          {
            key: "pack:constraint-gate",
            readiness: "error" as const,
            label: "configured Pack constraint gate",
            errorMessage: `Configured Pack constraints are unsatisfiable: ${deciding}`,
            blockingConditionIds: [PACK_CONSTRAINT_CONFLICT_BLOCKER_ID],
          },
        ]
      : [...blocked].sort().map((label) => ({
          key: `pack:${label}`,
          readiness: "error" as const,
          label,
          errorMessage: `Configured Pack constraints are unsatisfiable: ${deciding}${affected}`,
          blockingConditionIds: [PACK_CONSTRAINT_CONFLICT_BLOCKER_ID],
        }));
  return {
    _tag: "Plan",
    name: `Block configured Pack ${args.operation}`,
    description: Option.some("Configured Pack constraints cannot be satisfied together"),
    presentation: operationPresentation(
      {
        imperative: args.operation,
        past: args.operation === "install" ? "Installed" : "Updated",
        gerund: args.operation === "install" ? "Installing" : "Updating",
      },
      "pack",
    ),
    jobs: [{ concurrency: 1, steps }],
  };
};

/**
 * Refuse one configured entry whose effective constraint is a conflict,
 * before any write. The entry and every Pack that shares the member settle
 * together, so the entry is prevented for the same deciding facts that
 * prevent the Packs, under the same blocker reference.
 */
export const configuredEntryConstraintBlockPlan = (args: {
  readonly operation: "install" | "update";
  readonly type: Exclude<ExtensionType, "pack">;
  readonly name: string;
  readonly conflict: DesiredConstraintConflict;
}): Plan<InstallStepRequirements> => ({
  _tag: "Plan",
  name: `Block configured ${args.type} ${args.operation}`,
  description: Option.some("Configured constraints cannot be satisfied together"),
  presentation: operationPresentation(
    {
      imperative: args.operation,
      past: args.operation === "install" ? "Installed" : "Updated",
      gerund: args.operation === "install" ? "Installing" : "Updating",
    },
    args.type,
  ),
  jobs: [
    {
      concurrency: 1,
      steps: [
        {
          key: `${args.type}:${args.name}`,
          readiness: "error",
          label: toTypedLabel(args.type, args.name),
          errorMessage: `Configured constraints are unsatisfiable: ${desiredStateProblemsText([args.conflict])}`,
          blockingConditionIds: [PACK_CONSTRAINT_CONFLICT_BLOCKER_ID],
        },
      ],
    },
  ],
});

/**
 * One accepted member resolution the member's effective constraint excludes,
 * stated as the constraint fact sync reports for the same member.
 */
export interface AcceptedMemberMismatch {
  readonly fqn: string;
  readonly fact: ExtensionConstraintInvariantFact;
}
