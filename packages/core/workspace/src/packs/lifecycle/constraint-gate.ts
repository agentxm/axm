import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { type PackRef } from "@agentxm/extension-model/unstable/extensions/refs/pack";
import {
  DesiredStateReader,
  desiredStateProblemsText,
  type DesiredExtensionOrigin,
  type DesiredStateGraph,
  type DesiredStateProblem,
} from "../../desired-state/index.js";
import { operationPresentation, type Plan } from "../../transitions/planning/index.js";

import type { InstallStepRequirements } from "../../lifecycle/install/vocabulary.js";

const normalizedPackIdentity = (identity: string): string => identity.replace(/^workspace:/u, "");

const packOrigins = (origins: ReadonlyArray<DesiredExtensionOrigin>): ReadonlyArray<string> =>
  origins.flatMap((origin) =>
    origin.type === "pack" ? [normalizedPackIdentity(origin.pack)] : [],
  );

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
      selected.add(normalizedPackIdentity(node.identity));
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
  readonly problems: ReadonlyArray<ConstraintConflictProblem>;
}

export type ConstraintConflictProblem = Extract<
  DesiredStateProblem,
  { readonly type: "constraint-conflict" }
>;

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
      (problem): problem is ConstraintConflictProblem =>
        problem.type === "constraint-conflict" &&
        problem.contributors.some(
          (contributor) =>
            contributor.dependingPack !== undefined &&
            packIdentities.has(normalizedPackIdentity(contributor.dependingPack)),
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

/** Build the proposed graph once, then partition the selection into groups. */
export const prospectivePackUpdateGroups = (args: {
  readonly prospectivePacks: ReadonlyArray<PackRef>;
  readonly selectedNames?: ReadonlySet<string>;
}) =>
  Effect.flatMap(DesiredStateReader, (desiredState) =>
    desiredState.graph({ prospectivePacks: args.prospectivePacks }).pipe(
      Effect.map((graph) =>
        packUpdateGroups({
          graph,
          prospectivePacks: args.prospectivePacks,
          ...(args.selectedNames === undefined ? {} : { selectedNames: args.selectedNames }),
        }),
      ),
    ),
  );

export const relevantPackConstraintProblems = (args: {
  readonly graph: DesiredStateGraph;
  readonly prospectivePacks: ReadonlyArray<PackRef>;
  readonly selectedNames?: ReadonlySet<string>;
}): ReadonlyArray<Extract<DesiredStateProblem, { readonly type: "constraint-conflict" }>> => {
  const closure = selectedPackClosure(args.graph, args.prospectivePacks, args.selectedNames);
  return args.graph.problems.filter(
    (problem): problem is Extract<DesiredStateProblem, { readonly type: "constraint-conflict" }> =>
      problem.type === "constraint-conflict" &&
      problem.contributors.some(
        (contributor) =>
          contributor.dependingPack !== undefined &&
          closure.has(normalizedPackIdentity(contributor.dependingPack)),
      ),
  );
};

export const prospectivePackConstraintProblems = (args: {
  readonly prospectivePacks: ReadonlyArray<PackRef>;
  readonly selectedNames?: ReadonlySet<string>;
}) =>
  Effect.flatMap(DesiredStateReader, (desiredState) =>
    desiredState.graph({ prospectivePacks: args.prospectivePacks }).pipe(
      Effect.map((graph) =>
        relevantPackConstraintProblems({
          graph,
          prospectivePacks: args.prospectivePacks,
          ...(args.selectedNames === undefined ? {} : { selectedNames: args.selectedNames }),
        }),
      ),
    ),
  );

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
  readonly problems: ReadonlyArray<ConstraintConflictProblem>;
  /** Selected Pack names the group prevented; omit for an unattributed gate. */
  readonly blockedPackNames?: ReadonlyArray<string>;
}): Plan<InstallStepRequirements> => {
  const deciding = desiredStateProblemsText(args.problems);
  const blocked = args.blockedPackNames ?? [];
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
      : [...blocked].sort().map((name) => ({
          key: `pack:${name}`,
          readiness: "error" as const,
          label: name,
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
