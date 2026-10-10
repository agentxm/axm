/**
 * Configured-agent-outcomes provider port.
 *
 * Current native observations refine the generic lifecycle derivation. Missing
 * evidence for an enabled target fails closed; disabled/absent targets retain
 * their generic lifecycle result. Proposed changes belong to the prepared plan.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as ServiceMap from "effect/Context";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions/common";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import type { ConfiguredAgentOutcome, ErrorCode } from "../../operations/index.js";
import type { NativeLocationOutcome } from "../../locations/index.js";
import type { DesiredStateReaderService } from "./desired-state-reader.js";
import type { DesiredStateGraph } from "./desired-state-graph.js";
import type { LockfileReaderService } from "./lockfile-reader.js";
import type { SettingsReaderService } from "./settings-reader.js";
import { configuredAgentLifecycleOutcomes } from "./configured-agent-outcomes.js";

/**
 * A provider could not produce its outcomes. The implementation owns the
 * category and wording at construction; consumers transport the failure into
 * their own reporting envelope without re-rendering it.
 */
export class ConfiguredAgentOutcomesUnavailable extends Data.TaggedError(
  "ConfiguredAgentOutcomesUnavailable",
)<{
  readonly category: ErrorCode;
  readonly detail: string;
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
  readonly cause?: unknown;
}> {}

export interface ConfiguredExtensionObservation {
  readonly agentOutcomes: ReadonlyArray<ConfiguredAgentOutcome>;
  readonly nativeLocations: ReadonlyArray<NativeLocationOutcome>;
}

export type ConfiguredExtensionObservationsForRequest = (
  request: ConfiguredAgentOutcomesRequest,
) => Effect.Effect<
  ReadonlyMap<string, ConfiguredExtensionObservation>,
  ConfiguredAgentOutcomesUnavailable
>;

export interface ConfiguredAgentOutcomesProviderService {
  readonly byExtensionType: Partial<
    Record<ExtensionType, ConfiguredExtensionObservationsForRequest>
  >;
}

export class ConfiguredAgentOutcomesProvider extends ServiceMap.Service<
  ConfiguredAgentOutcomesProvider,
  ConfiguredAgentOutcomesProviderService
>()(
  "@agentxm/workspace-kernel/workspace-state/workspace/configured-agent-outcomes-provider/ConfiguredAgentOutcomesProvider",
) {}

export interface WorkspaceReadViewReaders {
  readonly settings: SettingsReaderService;
  readonly locks: LockfileReaderService;
  readonly desired: DesiredStateReaderService;
}

export interface ConfiguredAgentOutcomesRequest {
  /** Complete prepared graph when observing a closure before independent closures settle. */
  readonly desiredGraph?: DesiredStateGraph;
  /** Stable phase readers, supplied before the native observer composes its owners. */
  readonly readers?: WorkspaceReadViewReaders;
  readonly type: ExtensionType;
  readonly state: "current";
  readonly scope: WorkspaceScope;
  readonly agentIds: ReadonlyArray<string>;
  readonly rows: ReadonlyArray<{
    readonly name: string;
    readonly targetState: "enabled" | "disabled" | "absent";
    readonly installed: boolean;
    readonly paths?: ReadonlyArray<string>;
    readonly observedAgentIds?: ReadonlyArray<string>;
  }>;
}

/** Generic outcomes for all rows in one requested extension family. */
export const genericConfiguredAgentOutcomes = (
  request: ConfiguredAgentOutcomesRequest,
): ReadonlyMap<string, ReadonlyArray<ConfiguredAgentOutcome>> =>
  new Map(
    request.rows.map(
      (row) =>
        [
          row.name,
          configuredAgentLifecycleOutcomes({
            type: request.type,
            name: row.name,
            agentIds: request.agentIds,
            scope: request.scope,
            state: request.state,
            targetState: row.targetState,
            installed: row.installed,
            ...(row.observedAgentIds === undefined
              ? {}
              : { observedAgentIds: row.observedAgentIds }),
          }),
        ] as const,
    ),
  );

/** Resolve a type's rows with at most one manager read. Provider failures stay typed. */
export const resolveConfiguredExtensionObservations = (
  provider: ConfiguredAgentOutcomesProviderService,
  request: ConfiguredAgentOutcomesRequest,
): Effect.Effect<
  ReadonlyMap<string, ConfiguredExtensionObservation>,
  ConfiguredAgentOutcomesUnavailable
> =>
  Effect.gen(function* () {
    if (request.rows.length === 0) return new Map<string, ConfiguredExtensionObservation>();
    const generic = new Map<string, ConfiguredExtensionObservation>(
      [...genericConfiguredAgentOutcomes(request)].map(
        ([name, agentOutcomes]) =>
          [
            name,
            { agentOutcomes, nativeLocations: [] } satisfies ConfiguredExtensionObservation,
          ] as const,
      ),
    );
    const native = provider.byExtensionType[request.type];
    if (native !== undefined) {
      const observed = yield* native(request);
      for (const row of request.rows) {
        const facts = observed.get(row.name);
        if (facts === undefined && row.targetState === "enabled") {
          const baseline = generic.get(row.name);
          if (baseline !== undefined)
            generic.set(row.name, {
              nativeLocations: [],
              agentOutcomes: baseline.agentOutcomes.map((outcome) => ({
                ...outcome,
                outcome: "blocked",
                reasonCode: "native-observation-unavailable",
                reason: "The native observer returned no evidence for this extension.",
              })),
            });
        }
        if (facts !== undefined)
          generic.set(row.name, {
            ...facts,
            agentOutcomes:
              row.targetState === "enabled"
                ? facts.agentOutcomes
                : (generic.get(row.name)?.agentOutcomes ?? []),
          });
      }
      return generic;
    }
    if (request.type !== "pack") {
      for (const [name, baseline] of generic)
        generic.set(name, {
          ...baseline,
          agentOutcomes: baseline.agentOutcomes.map((outcome) =>
            outcome.outcome === "current" || outcome.outcome === "projected"
              ? {
                  ...outcome,
                  outcome: "blocked",
                  reasonCode: "native-observation-unavailable",
                  reason: "No native observer is available to verify this extension.",
                }
              : outcome,
          ),
        });
    }
    return generic;
  });

/** Per-agent views are derived from the same native observations as inventories. */
export const resolveConfiguredAgentOutcomes = (
  provider: ConfiguredAgentOutcomesProviderService,
  request: ConfiguredAgentOutcomesRequest,
) =>
  resolveConfiguredExtensionObservations(provider, request).pipe(
    Effect.map(
      (observations) =>
        new Map([...observations].map(([name, facts]) => [name, facts.agentOutcomes])),
    ),
  );
