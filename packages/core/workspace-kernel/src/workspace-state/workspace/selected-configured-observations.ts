/** Selected verification uses desired/canonical facts, never display inventory. */
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import {
  ConfiguredAgentOutcomesProvider,
  resolveConfiguredExtensionObservations,
  type ConfiguredExtensionObservation,
} from "./configured-agent-outcomes-provider.js";
import { CurrentWorkspaceReadPhase } from "./read-phase.js";
import { DesiredStateReader } from "./desired-state-reader.js";
import type { DesiredStateGraph } from "./desired-state-graph.js";
import type { ExtensionTarget } from "./contracts.js";
import { LockfileReader } from "./lockfile-reader.js";
import { WorkspaceLocation } from "./location.js";
import { observeCanonicalExtension } from "./canonical-observation.js";

export const observeConfiguredTargets = Effect.fn("axm.observation.selected-native")(function* (
  targets: ReadonlyArray<Pick<ExtensionTarget, "type" | "name">>,
  agentIds: ReadonlyArray<string>,
  preparedGraph?: DesiredStateGraph,
) {
  const provider = yield* ConfiguredAgentOutcomesProvider;
  const location = yield* WorkspaceLocation;
  const locks = yield* LockfileReader;
  const graph = preparedGraph ?? (yield* (yield* DesiredStateReader).graph());
  const phase = yield* CurrentWorkspaceReadPhase;
  const layout = yield* Ref.get(location.layout);
  const result = new Map<string, ConfiguredExtensionObservation>();
  const selected = graph.nodes.filter((node) =>
    targets.some((target) => target.type === node.type && target.name === node.name),
  );
  yield* Effect.annotateCurrentSpan("axm.work.count", selected.length);
  for (const type of new Set(selected.map((node) => node.type))) {
    const rows = yield* Effect.forEach(
      selected.filter((node) => node.type === type),
      (node) =>
        Effect.gen(function* () {
          const accepted = yield* locks.acceptedEntry(node.type, node.name);
          const canonical = yield* observeCanonicalExtension({
            layout,
            desired: node,
            accepted: Option.getOrUndefined(accepted),
          });
          return {
            name: node.name,
            targetState: "enabled" as const,
            installed: canonical.status === "usable" || canonical.status === "not-applicable",
            ...("path" in canonical && canonical.path !== undefined
              ? { paths: [canonical.path] }
              : {}),
          };
        }),
    );
    const observations = yield* resolveConfiguredExtensionObservations(provider, {
      type,
      state: "current",
      scope: location.scope,
      agentIds,
      desiredGraph: graph,
      ...(phase === undefined ? {} : { readers: phase.readers }),
      rows,
    });
    for (const [name, observation] of observations) result.set(`${type}:${name}`, observation);
  }
  return result;
});
