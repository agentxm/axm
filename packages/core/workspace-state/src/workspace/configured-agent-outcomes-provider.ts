/**
 * Configured-agent-outcomes provider port.
 *
 * The plan pipeline reports per-agent lifecycle outcomes against the generic
 * `configuredAgentLifecycleOutcomes` derivation. A per-type manager may know
 * the effective outcomes more precisely (today the hook manager reads agent
 * hook surfaces directly), so the state layer declares only this optional
 * port keyed by extension type; the application composes the implementations.
 * An absent provider — or an absent entry for a type — degrades to the
 * generic derivation, matching the plan pipeline's existing fallback.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as ServiceMap from "effect/Context";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions/common";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import type { ConfiguredAgentOutcome } from "./configured-agent-outcome.js";

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
  "@agentxm/workspace-state/workspace/configured-agent-outcomes-provider/ConfiguredAgentOutcomesProvider",
) {}
