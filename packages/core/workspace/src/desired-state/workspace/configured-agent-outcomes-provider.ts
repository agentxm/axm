/**
 * Configured-agent-outcomes provider port.
 *
 * One resolution rule overlays effective outcomes from a per-type manager on
 * the generic lifecycle derivation. An absent provider entry, an empty result
 * for a row, or a disabled/absent target retains the generic result.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as ServiceMap from "effect/Context";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions/common";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import type { ConfiguredAgentOutcome } from "./configured-agent-outcome.js";
import { configuredAgentLifecycleOutcomes } from "./configured-agent-outcomes.js";

/**
 * Failure category vocabulary for a provider failure. The literals are the
 * same strings as the plan pipeline's `OperationErrorCategory` and the CLI's
 * `AppErrorCode`; the conversion sites in those packages assert the parity at
 * compile time by assigning this type to theirs.
 */
export type ConfiguredAgentOutcomesFailureCategory =
  | "issues"
  | "usage"
  | "not_found"
  | "auth"
  | "forbidden"
  | "conflict"
  | "rate_limit"
  | "network"
  | "validation"
  | "internal"
  | "unavailable"
  | "quota"
  | "auth_required"
  | "auth_expired"
  | "auth_denied"
  | "timeout";

/**
 * A provider could not produce its outcomes. The implementation owns the
 * category and wording at construction; consumers transport the failure into
 * their own reporting envelope without re-rendering it.
 */
export class ConfiguredAgentOutcomesUnavailable extends Data.TaggedError(
  "ConfiguredAgentOutcomesUnavailable",
)<{
  readonly category: ConfiguredAgentOutcomesFailureCategory;
  readonly detail: string;
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
  readonly cause?: unknown;
}> {}

/** Effective outcomes for one extension type in the projected or current state. */
export type ConfiguredAgentOutcomesForState = (
  state: "projected" | "current",
) => Effect.Effect<ReadonlyArray<ConfiguredAgentOutcome>, ConfiguredAgentOutcomesUnavailable>;

export interface ConfiguredAgentOutcomesProviderService {
  readonly byExtensionType: Partial<Record<ExtensionType, ConfiguredAgentOutcomesForState>>;
}

export class ConfiguredAgentOutcomesProvider extends ServiceMap.Service<
  ConfiguredAgentOutcomesProvider,
  ConfiguredAgentOutcomesProviderService
>()(
  "@agentxm/workspace/desired-state/workspace/configured-agent-outcomes-provider/ConfiguredAgentOutcomesProvider",
) {}

export interface ConfiguredAgentOutcomesRequest {
  readonly type: ExtensionType;
  readonly state: "projected" | "current";
  readonly scope: WorkspaceScope;
  readonly agentIds: ReadonlyArray<string>;
  readonly rows: ReadonlyArray<{
    readonly name: string;
    readonly targetState: "enabled" | "disabled" | "absent";
    readonly installed: boolean;
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
export const resolveConfiguredAgentOutcomes = (
  provider: ConfiguredAgentOutcomesProviderService,
  request: ConfiguredAgentOutcomesRequest,
): Effect.Effect<
  ReadonlyMap<string, ReadonlyArray<ConfiguredAgentOutcome>>,
  ConfiguredAgentOutcomesUnavailable
> =>
  Effect.gen(function* () {
    const generic = new Map(genericConfiguredAgentOutcomes(request));
    const override = provider.byExtensionType[request.type];
    if (override === undefined || !request.rows.some((row) => row.targetState === "enabled")) {
      return generic;
    }
    const byName = new Map<string, Array<ConfiguredAgentOutcome>>();
    for (const outcome of yield* override(request.state)) {
      const values = byName.get(outcome.name) ?? [];
      values.push(outcome);
      byName.set(outcome.name, values);
    }
    for (const row of request.rows) {
      if (row.targetState !== "enabled") continue;
      const outcomes = byName.get(row.name);
      if (outcomes !== undefined && outcomes.length > 0) generic.set(row.name, outcomes);
    }
    return generic;
  });
