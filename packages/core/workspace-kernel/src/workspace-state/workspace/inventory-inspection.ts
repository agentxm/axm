/** Explicit native inspection shared by queries and lifecycle planning. */
import * as Effect from "effect/Effect";
import type { ConfiguredAgentOutcome } from "../../operations/index.js";
import {
  countExtensionInventory,
  isDesiredInventoryLifecycle,
  projectExtensionInventory,
  type ExtensionInventory,
} from "../observed/extensions/inventory.js";
import {
  genericConfiguredAgentOutcomes,
  resolveConfiguredExtensionObservations,
  type ConfiguredAgentOutcomesProviderService,
  type ConfiguredAgentOutcomesRequest,
} from "./configured-agent-outcomes-provider.js";

export const inspectExtensionInventory = Effect.fn("WorkspaceRecords.inspectExtensionInventory")(
  function* (
    inventory: ExtensionInventory,
    provider: ConfiguredAgentOutcomesProviderService,
    context: Pick<ConfiguredAgentOutcomesRequest, "readers" | "scope" | "agentIds">,
  ) {
    const inventories = yield* Effect.forEach(
      [...new Set(inventory.items.map((row) => row.type))],
      (type) =>
        Effect.gen(function* () {
          const rows = inventory.items.filter((row) => row.type === type);
          const request: ConfiguredAgentOutcomesRequest = {
            ...context,
            type,
            state: "current",
            rows: rows
              .filter(
                (row) =>
                  type === "skill" || isDesiredInventoryLifecycle(row.classification.lifecycle),
              )
              .map((row) => ({
                name: row.name,
                targetState: !isDesiredInventoryLifecycle(row.classification.lifecycle)
                  ? "absent"
                  : row.enabled === false
                    ? "disabled"
                    : "enabled",
                installed: row.installed === true,
                paths: row.paths,
                observedAgentIds: row.observedAgents ?? [],
              })),
          };
          const observed = yield* resolveConfiguredExtensionObservations(provider, request).pipe(
            Effect.result,
          );
          const observations =
            observed._tag === "Success"
              ? observed.success
              : new Map(
                  [...genericConfiguredAgentOutcomes(request)].map(([name, outcomes]) => [
                    name,
                    {
                      agentOutcomes: outcomes.map((outcome): ConfiguredAgentOutcome => ({
                        ...outcome,
                        outcome: "blocked",
                        reasonCode: "native-observation-unavailable",
                        reason: "Native locations could not be verified.",
                      })),
                      nativeLocations: [],
                    },
                  ]),
                );
          const projected = projectExtensionInventory(rows, {
            outcomes: (row) =>
              isDesiredInventoryLifecycle(row.classification.lifecycle)
                ? (observations.get(row.name)?.agentOutcomes ?? [])
                : [],
            nativeLocations: (row) =>
              provider.byExtensionType[type] === undefined
                ? undefined
                : observations?.get(row.name)?.nativeLocations,
          });
          return {
            ...projected,
            items: projected.items.map((row) => ({
              ...row,
              inspectionDiagnostics:
                observed._tag === "Failure"
                  ? [observed.failure.detail]
                  : provider.byExtensionType[type] === undefined && type !== "pack"
                    ? ["Native observation provider is unavailable."]
                    : [],
              inspectionState:
                type === "pack"
                  ? ("not-applicable" as const)
                  : row.installed === null ||
                      provider.byExtensionType[type] === undefined ||
                      observed._tag === "Failure" ||
                      observations.get(row.name) === undefined ||
                      row.agentOutcomes.some(
                        (outcome) => outcome.reasonCode === "native-observation-unavailable",
                      )
                    ? ("partial" as const)
                    : ("complete" as const),
            })),
          };
        }),
    );
    return {
      ...countExtensionInventory(inventories.flatMap((result) => result.items)),
      ...(inventory.observationDiagnostics === undefined
        ? {}
        : { observationDiagnostics: inventory.observationDiagnostics }),
    };
  },
);
