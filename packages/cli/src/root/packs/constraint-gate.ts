import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { PackRef } from "@agentxm/client-core/unstable/packs";
import type { Plan } from "@agentxm/client-core/unstable/plan";
import {
  desiredStateProblemsText,
  type DesiredExtensionOrigin,
  type DesiredStateGraph,
  type DesiredStateProblem,
  type WorkspaceMutationsService,
} from "@agentxm/client-core/unstable/workspace";

const normalizedPackIdentity = (identity: string): string => identity.replace(/^workspace:/u, "");

const packOrigins = (origins: ReadonlyArray<DesiredExtensionOrigin>): ReadonlyArray<string> =>
  origins.flatMap((origin) =>
    origin.type === "pack" ? [normalizedPackIdentity(origin.pack)] : [],
  );

const selectedPackClosure = (
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

  const closure = new Set(selected);
  const pending = [...selected];
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
  readonly workspace: WorkspaceMutationsService;
  readonly prospectivePacks: ReadonlyArray<PackRef>;
  readonly selectedNames?: ReadonlySet<string>;
}) =>
  args.workspace.getDesiredStateGraph({ prospectivePacks: args.prospectivePacks }).pipe(
    Effect.map((graph) =>
      relevantPackConstraintProblems({
        graph,
        prospectivePacks: args.prospectivePacks,
        ...(args.selectedNames === undefined ? {} : { selectedNames: args.selectedNames }),
      }),
    ),
  );

export const configuredPackConstraintBlockPlan = (args: {
  readonly operation: "install" | "update";
  readonly problems: ReadonlyArray<
    Extract<DesiredStateProblem, { readonly type: "constraint-conflict" }>
  >;
}): Plan => ({
  _tag: "Plan",
  name: `Block configured Pack ${args.operation}`,
  description: Option.some("Configured Pack constraints cannot be satisfied together"),
  jobs: [
    {
      concurrency: 1,
      steps: [
        {
          key: "pack:constraint-gate",
          readiness: "error",
          label: "configured Pack constraint gate",
          errorMessage: `Configured Pack constraints are unsatisfiable: ${desiredStateProblemsText(args.problems)}`,
        },
      ],
    },
  ],
});
