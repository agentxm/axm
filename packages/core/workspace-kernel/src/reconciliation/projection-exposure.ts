import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { formatFqn } from "@agentxm/extension-model/unstable/extensions/fqn";
import {
  extensionRefName,
  type ExtensionRef,
} from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import { StepFailure } from "../operations/index.js";
import { observeProjectionPlans, type ProjectionUnitObservation } from "../projection/index.js";
import { KnowledgeManager, RuleManager } from "../materialization/index.js";
import {
  acceptedLockedResolutionRef,
  formatDesiredIdentity,
  type DesiredStateGraph,
} from "../workspace-state/index.js";

/** Exact sources contributing to a rewritten native unit, including retained packages. */
export const projectionExposureRefs = Effect.fn("projectionExposureRefs")(function* (args: {
  readonly observations: ReadonlyArray<ProjectionUnitObservation>;
  readonly graph: DesiredStateGraph;
  readonly proposedRefs: ReadonlyArray<ExtensionRef>;
}) {
  const wholeInstructionSources = new Set(
    args.observations
      .filter((observation) =>
        observation.nativeLocations?.some(
          (unit) =>
            unit.policyReasons.includes("instruction-propagation") &&
            (unit.state === "created" || unit.state === "updated"),
        ),
      )
      .flatMap((observation) =>
        (observation.nativeLocations ?? []).flatMap((unit) =>
          unit.address.kind === "region" ? [unit.address.path] : [],
        ),
      ),
  );
  const additionalContributors =
    wholeInstructionSources.size === 0
      ? []
      : yield* Effect.gen(function* () {
          const managers = [yield* RuleManager, yield* KnowledgeManager];
          const observations = yield* Effect.forEach(managers, (manager) =>
            manager
              .projectionPlans({ desiredGraph: args.graph })
              .pipe(Effect.flatMap(observeProjectionPlans)),
          );
          return observations
            .flat()
            .filter((observation) =>
              observation.nativeLocations?.some(
                (unit) =>
                  unit.address.kind === "region" && wholeInstructionSources.has(unit.address.path),
              ),
            )
            .flatMap((observation) => observation.expectedContributors);
        });
  const contributors = new Set([
    ...additionalContributors,
    ...args.observations
      .filter((observation) => {
        const locations = observation.nativeLocations ?? [];
        return locations.length === 0
          ? !observation.current
          : locations.some(
              (unit) =>
                unit.state !== "removed" &&
                unit.state !== "absent" &&
                !(
                  unit.state === "unchanged" &&
                  (unit.ownership === "owned" || unit.ownership === "declared")
                ),
            );
      })
      .flatMap((observation) => observation.expectedContributors),
  ]);
  if (contributors.size === 0) return [];
  const refs: ExtensionRef[] = args.proposedRefs.filter(
    (ref) =>
      ref.refType !== "workspace" &&
      ref.owner !== undefined &&
      contributors.has(formatFqn({ owner: ref.owner, type: ref.type, name: ref.name })),
  );
  for (const node of args.graph.nodes) {
    if (
      !node.enabled ||
      node.identity.authority === "workspace" ||
      node.identity.authority === "bundled" ||
      node.identity.authority === "inline"
    )
      continue;
    if (
      !contributors.has(formatDesiredIdentity(node.identity)) &&
      (node.identity.fqn === undefined || !contributors.has(node.identity.fqn))
    )
      continue;
    if (
      args.proposedRefs.some((ref) => ref.type === node.type && extensionRefName(ref) === node.name)
    )
      continue;
    const accepted = yield* acceptedLockedResolutionRef({ type: node.type, name: node.name });
    if (Option.isNone(accepted))
      return yield* new StepFailure({
        category: "conflict",
        detail: `The exact accepted source for ${node.type} ${node.name} is unavailable; the shared native output cannot be rewritten.`,
      });
    if (accepted.value.refType !== "workspace") refs.push(accepted.value);
  }
  return refs;
});
