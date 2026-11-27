/**
 * Catalog-derived agent projections and the scoped agent read-model API.
 *
 * Per Decision 3 (agents have declared + actual only; no resolved layer) of
 * the workspace read-model design, every configurable catalog agent shares
 * the same declared, actual, and detected projectors. The canonical
 * capability catalog carries genuine per-agent variance, so adding an agent
 * does not require a placeholder module or registry edit here.
 *
 * - `declaredAgent(agentId, scope, settings)` — returns
 *   `Option.some(DeclaredAgent)` iff the decoded settings list the agent in
 *   its `agents` array. Pure function over already-decoded settings.
 * - `actualAgent(agentId, scope, observations)` — returns
 *   `Option.some(ActualAgent)` iff at least one scanner observation refers to
 *   the agent. Combines agent-dir, agent-settings, and per-agent MCP-config
 *   evidence.
 * - `detectedAgent(agentId, scope, declared, present, actual)` — combines the
 *   two into a `DetectedAgent` when at least one is present; returns
 *   `Option.none()` when both are absent (no evidence either way).
 */

import * as Array from "effect/Array";
import type * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { AGENT_DESCRIPTORS } from "@agentxm/extension-model/unstable/agents/registry";
import {
  isConfigurableAgentId,
  CONFIGURABLE_AGENT_IDS,
  type ConfigurableAgentId,
} from "@agentxm/extension-model/unstable/agent-capabilities/identity";
import type { AgentDescriptor } from "@agentxm/extension-model/unstable/agents/types";
import type { SettingsReadError } from "../desired/settings/errors.js";
import type {
  AgentDirOccurrence,
  AgentSettingsOccurrence,
  McpConfigOccurrence,
} from "./scanners/types.js";
import type { Scope } from "./types.js";

// ---------------------------------------------------------------------------
// Declared agent
// ---------------------------------------------------------------------------

/**
 * Settings-derived declaration of an agent for a given scope. Produced by
 * `declaredAgent` when the scope's `axm.json` lists the agent in its `agents`
 * array.
 */
interface DeclaredAgent {
  readonly scope: Scope;
  readonly agentId: ConfigurableAgentId;
}

// ---------------------------------------------------------------------------
// Actual agent
// ---------------------------------------------------------------------------

/**
 * Observable per-agent evidence collected from scanner outputs. An agent is
 * "actual present" in a scope if at least one scanner observation refers to
 * that agent — agent-dir occurrences for any subject, an agent-settings file,
 * or an agent MCP config. The projector collects the underlying observations
 * so consumers can render diagnostic detail.
 *
 * The actual layer NEVER fails (Decision 1).
 */
interface ActualAgent {
  readonly scope: Scope;
  readonly agentId: ConfigurableAgentId;
  readonly agentDirOccurrences: ReadonlyArray<AgentDirOccurrence>;
  readonly agentSettingsOccurrences: ReadonlyArray<AgentSettingsOccurrence>;
  readonly mcpConfigOccurrences: ReadonlyArray<McpConfigOccurrence>;
}

// ---------------------------------------------------------------------------
// Detected agent
// ---------------------------------------------------------------------------

/**
 * Classification of an agent by combining declared + actual evidence. The
 * three values mirror today's "managed agent" / "unmanaged agent" / "missing"
 * classifications used by `axm setup` and lint diagnostics.
 *
 * - `managed-and-present` — settings declares the agent AND scanners observed
 *   evidence in the workspace.
 * - `managed-not-present` — settings declares the agent BUT no scanners
 *   observed evidence.
 * - `unmanaged-present` — scanners observed evidence BUT settings does not
 *   declare the agent.
 *
 * Agents that are neither declared nor present are NOT included in the
 * `detected` projection — there is nothing to surface for an agent the user
 * has not interacted with.
 */
type DetectionStatus = "managed-and-present" | "managed-not-present" | "unmanaged-present";

interface DetectedAgent {
  readonly scope: Scope;
  readonly agentId: ConfigurableAgentId;
  readonly status: DetectionStatus;
  readonly present: boolean;
  readonly declared: Option.Option<DeclaredAgent>;
  readonly actual: Option.Option<ActualAgent>;
}

// ---------------------------------------------------------------------------
// Scanner observations passed into the actual projector
// ---------------------------------------------------------------------------

/**
 * Pre-filtered scanner observations for one agent. Phase 9's live composition
 * narrows scanner outputs by `agentId` once and threads the result into the
 * `actualAgent` projector.
 *
 * Each array is the (possibly empty) sequence of observations for this agent
 * within the same scope. Per design Decision 5, the actual layer concatenates
 * scanner outputs — duplicates of the same physical occurrence are collapsed
 * upstream by the scanner-occurrence-identity helper.
 */
export interface AgentScannerObservations {
  readonly agentDir: ReadonlyArray<AgentDirOccurrence>;
  readonly agentSettings: ReadonlyArray<AgentSettingsOccurrence>;
  readonly mcpConfig: ReadonlyArray<McpConfigOccurrence>;
}

// ---------------------------------------------------------------------------
// Settings shape consumed by `declaredAgent`
// ---------------------------------------------------------------------------

/**
 * Subset of decoded `axm.json` the `declaredAgent` projector needs. It
 * accepts this narrowed shape so it can be unit-tested without depending on
 * the full Settings schema.
 */
interface DeclaredSettingsShape {
  readonly agents?: ReadonlyArray<ConfigurableAgentId>;
}

// ---------------------------------------------------------------------------
// Projectors
// ---------------------------------------------------------------------------

export const declaredAgent = (
  agentId: ConfigurableAgentId,
  scope: Scope,
  settings: Option.Option<DeclaredSettingsShape>,
): Option.Option<DeclaredAgent> => {
  if (Option.isNone(settings)) return Option.none();
  const declaredAgents = settings.value.agents ?? [];
  if (!declaredAgents.includes(agentId)) return Option.none();
  return Option.some({ scope, agentId });
};

export const actualAgent = (
  agentId: ConfigurableAgentId,
  scope: Scope,
  observations: AgentScannerObservations,
): Option.Option<ActualAgent> => {
  const agentDir = observations.agentDir.filter(
    (occ) =>
      occ.agentId === agentId &&
      (occ.readPathStatus === undefined || occ.readPathStatus === "primary"),
  );
  const agentSettings = observations.agentSettings.filter((occ) => occ.agentId === agentId);
  const mcpConfig = observations.mcpConfig.filter(
    (occ) => occ.surface._tag === "agent" && occ.surface.agentId === agentId,
  );
  if (agentDir.length === 0 && agentSettings.length === 0 && mcpConfig.length === 0) {
    return Option.none();
  }
  return Option.some({
    scope,
    agentId,
    agentDirOccurrences: agentDir,
    agentSettingsOccurrences: agentSettings,
    mcpConfigOccurrences: mcpConfig,
  });
};

export const detectedAgent = (
  agentId: ConfigurableAgentId,
  scope: Scope,
  declared: Option.Option<DeclaredAgent>,
  present: boolean,
  actual: Option.Option<ActualAgent>,
): Option.Option<DetectedAgent> => {
  const isDeclared = Option.isSome(declared);
  const status: Option.Option<DetectionStatus> =
    isDeclared && present
      ? Option.some("managed-and-present")
      : isDeclared
        ? Option.some("managed-not-present")
        : present
          ? Option.some("unmanaged-present")
          : Option.none();
  return Option.map(status, (s) => ({
    scope,
    agentId,
    status: s,
    present,
    declared,
    actual,
  }));
};

// ---------------------------------------------------------------------------
// Scoped agent read-model API
// ---------------------------------------------------------------------------

const isAgentId = (id: string): id is ConfigurableAgentId => Object.hasOwn(AGENT_DESCRIPTORS, id);

/** Public shape of `ctx.scope(scope).agents`. */
export interface ScopedAgentsApi {
  readonly list: Effect.Effect<ReadonlyArray<ConfigurableAgentId>>;
  readonly known: Effect.Effect<ReadonlyArray<AgentDescriptor>>;
  readonly byId: (id: string) => Option.Option<AgentDescriptor>;
  readonly declared: (
    id: ConfigurableAgentId,
  ) => Effect.Effect<Option.Option<DeclaredAgent>, SettingsReadError>;
  readonly actual: (id: ConfigurableAgentId) => Effect.Effect<Option.Option<ActualAgent>>;
  readonly detected: Effect.Effect<ReadonlyArray<DetectedAgent>, Config.ConfigError>;
}

/** Dependency-closed inputs captured by the scoped agent API. */
interface ScopedAgentsApiDeps {
  readonly scope: Scope;
  readonly settings: Effect.Effect<Option.Option<DeclaredSettingsShape>, SettingsReadError>;
  readonly presence: Effect.Effect<ReadonlySet<ConfigurableAgentId>, Config.ConfigError>;
  readonly observations: Effect.Effect<AgentScannerObservations>;
}

/** Build the agent portion of a scoped workspace read model. */
export const makeScopedAgentsApi = (deps: ScopedAgentsApiDeps): ScopedAgentsApi => {
  const { scope, settings, presence, observations } = deps;

  const declared = (id: ConfigurableAgentId) =>
    isConfigurableAgentId(id)
      ? settings.pipe(Effect.map((decoded) => declaredAgent(id, scope, decoded)))
      : Effect.succeed(Option.none<DeclaredAgent>());

  const actual = (id: ConfigurableAgentId) =>
    isConfigurableAgentId(id)
      ? observations.pipe(Effect.map((obs) => actualAgent(id, scope, obs)))
      : Effect.succeed(Option.none<ActualAgent>());

  const detected = Effect.all([
    Effect.result(settings).pipe(
      Effect.map((settingsResult) =>
        settingsResult._tag === "Failure"
          ? Option.none<DeclaredSettingsShape>()
          : settingsResult.success,
      ),
    ),
    presence,
    observations,
  ]).pipe(
    Effect.map(([decoded, presentAgentIds, obs]) =>
      Array.getSomes(
        CONFIGURABLE_AGENT_IDS.map((agentId) =>
          detectedAgent(
            agentId,
            scope,
            declaredAgent(agentId, scope, decoded),
            presentAgentIds.has(agentId),
            actualAgent(agentId, scope, obs),
          ),
        ),
      ),
    ),
  );

  return {
    list: Effect.succeed(CONFIGURABLE_AGENT_IDS),
    known: Effect.succeed(CONFIGURABLE_AGENT_IDS.map((id) => AGENT_DESCRIPTORS[id])),
    byId: (id) => (isAgentId(id) ? Option.some(AGENT_DESCRIPTORS[id]) : Option.none()),
    declared,
    actual,
    detected,
  };
};
