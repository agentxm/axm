import { annotateWork, withWork } from "@agentxm/host-primitives/work-observation";
/** Selected verification uses desired/canonical facts, never display inventory. */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
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
import { observeCanonicalExtensionCapturing } from "./canonical-observation.js";

/** Types whose observer selects aggregate contributors from the desired graph. */
const aggregateContributorTypes: ReadonlySet<string> = new Set(["rule", "knowledge", "hook"]);

export const observeConfiguredTargets = Effect.fnUntraced(
  function* (
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
    // Observations made through the active observation phase's own port, of
    // the graph its readers hold, may serve the observers in that phase.
    const handing =
      phase !== undefined &&
      phase.observations &&
      phase.isActive() &&
      preparedGraph === undefined &&
      (yield* FileSystem.FileSystem) === phase.fileSystem
        ? phase
        : undefined;
    const result = new Map<string, ConfiguredExtensionObservation>();
    const selected = graph.nodes.filter((node) =>
      targets.some((target) => target.type === node.type && target.name === node.name),
    );
    yield* annotateWork({ "axm.work.count": selected.length });
    for (const type of new Set(selected.map((node) => node.type))) {
      const rows = yield* Effect.forEach(
        selected.filter((node) => node.type === type),
        (node) =>
          Effect.gen(function* () {
            const accepted = yield* locks.acceptedEntry(node.type, node.name);
            const { observation: canonical, manifest } = yield* observeCanonicalExtensionCapturing({
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
              // The Subagent observer derives an acquired package's ref from
              // this phase's own usable observation of the identical node and
              // row; any other row leaves the observer to observe for itself.
              ...(handing !== undefined &&
              node.type === "subagent" &&
              node.identity.authority !== "workspace" &&
              node.identity.authority !== "bundled" &&
              canonical.status === "usable" &&
              canonical.path !== undefined
                ? {
                    acceptedCanonical: Object.freeze({
                      desired: node,
                      ...(Option.isSome(accepted) ? { accepted: accepted.value } : {}),
                      observation: canonical,
                    }),
                  }
                : {}),
              // An aggregate contributor selection takes this observation of
              // the identical node, row and layout while this phase is active.
              ...(handing !== undefined && aggregateContributorTypes.has(node.type)
                ? {
                    canonicalObservation: Object.freeze({
                      phase: handing,
                      desired: node,
                      accepted: Option.getOrUndefined(accepted),
                      layout,
                      observation: canonical,
                      manifest,
                    }),
                  }
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
  },
  (effect) => withWork("axm.observation.selected-native", effect),
);
