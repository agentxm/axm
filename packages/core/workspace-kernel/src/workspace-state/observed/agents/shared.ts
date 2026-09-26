/**
 * Shared default projectors used by every per-agent module.
 *
 * The default behavior captures the v1 contract:
 *
 * - `defaultDeclared(agentId, scope, settings)` — returns
 *   `Option.some(DeclaredAgent)` iff the decoded settings list the agent in
 *   its `agents` array. Pure function over already-decoded settings.
 * - `defaultActual(agentId, scope, observations)` — returns
 *   `Option.some(ActualAgent)` iff at least one scanner observation refers to
 *   the agent. Combines agent-dir, agent-settings, and per-agent MCP-config
 *   evidence.
 * - `defaultDetected(agentId, scope, declared, actual)` — combines the two
 *   into a `DetectedAgent` when at least one is present; returns
 *   `Option.none()` when both are absent (no evidence either way).
 *
 * Per-agent modules override these only if their native config requires
 * agent-specific evidence rules. v1 modules all reuse these defaults, and
 * `defineAgentModule` builds a module from them.
 */

import * as Option from "effect/Option";
import type {
  AgentDescriptor,
  MaterializationTargetId,
} from "@agentxm/extension-model/unstable/agents/types";
import type { Scope } from "../types.js";
import type {
  ActualAgent,
  AgentModule,
  AgentScannerObservations,
  AgentSubjectType,
  DeclaredAgent,
  DeclaredSettingsShape,
  DetectedAgent,
  DetectionStatus,
} from "./types.js";

export const defaultDeclared = (
  agentId: MaterializationTargetId,
  scope: Scope,
  settings: Option.Option<DeclaredSettingsShape>,
): Option.Option<DeclaredAgent> => {
  if (Option.isNone(settings)) return Option.none();
  const declaredAgents = settings.value.agents ?? [];
  if (!declaredAgents.includes(agentId)) return Option.none();
  return Option.some({ scope, agentId });
};

export const defaultActual = (
  agentId: MaterializationTargetId,
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

export const defaultDetected = (
  agentId: MaterializationTargetId,
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
// defineAgentModule factory
// ---------------------------------------------------------------------------

/**
 * Inputs to `defineAgentModule`. The factory derives `subjects` from the
 * descriptor so registration does not repeat scanner-relevant subject data.
 */
export interface DefineAgentModuleInput<TId extends MaterializationTargetId> {
  readonly agentId: TId;
  readonly descriptor: AgentDescriptor;
}

/**
 * Derive the subjects the agent renders into per-agent directories from its
 * descriptor.
 */
const subjectsFromDescriptor = (descriptor: AgentDescriptor): ReadonlyArray<AgentSubjectType> => {
  const out: Array<AgentSubjectType> = [];
  if (descriptor.skills !== undefined) out.push("skill");
  if (descriptor.subagents !== undefined) out.push("subagent");
  return out;
};

/**
 * Build a complete `AgentModule` for `agentId`. The projectors call the v1
 * `defaultDeclared` / `defaultActual` / `defaultDetected` helpers above.
 * `subjects` is derived from `descriptor`.
 *
 * The registry creates these modules directly from the canonical catalog.
 */
export const defineAgentModule = <TId extends MaterializationTargetId>(
  input: DefineAgentModuleInput<TId>,
): AgentModule<TId> => {
  const { agentId, descriptor } = input;
  const subjects = subjectsFromDescriptor(descriptor);
  return {
    agentId,
    subjects,
    declared: (scope, settings) => defaultDeclared(agentId, scope, settings),
    actual: (scope, observations) => defaultActual(agentId, scope, observations),
    detected: (scope, declared, present, actual) =>
      defaultDetected(agentId, scope, declared, present, actual),
  };
};
