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
 * agent-specific evidence rules. v1 modules all reuse these defaults.
 */

import * as Option from "effect/Option";
import type { AgentId } from "../../../agents/types.js";
import type { Scope } from "../types.js";
import type {
  ActualAgent,
  AgentScannerObservations,
  DeclaredAgent,
  DeclaredSettingsShape,
  DetectedAgent,
  DetectionStatus,
} from "./types.js";

export const defaultDeclared = (
  agentId: AgentId,
  scope: Scope,
  settings: Option.Option<DeclaredSettingsShape>,
): Option.Option<DeclaredAgent> => {
  if (Option.isNone(settings)) return Option.none();
  const declaredAgents = settings.value.agents ?? [];
  if (!declaredAgents.includes(agentId)) return Option.none();
  return Option.some({ scope, agentId });
};

export const defaultActual = (
  agentId: AgentId,
  scope: Scope,
  observations: AgentScannerObservations,
): Option.Option<ActualAgent> => {
  const agentDir = observations.agentDir.filter((occ) => occ.agentId === agentId);
  const agentSettings = observations.agentSettings.filter((occ) => occ.agentId === agentId);
  const mcpConfig = observations.mcpConfig.filter(
    (occ) => occ.origin === "agent" && occ.agentId === agentId,
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
  agentId: AgentId,
  scope: Scope,
  declared: Option.Option<DeclaredAgent>,
  actual: Option.Option<ActualAgent>,
): Option.Option<DetectedAgent> => {
  const isDeclared = Option.isSome(declared);
  const isActual = Option.isSome(actual);
  const status: Option.Option<DetectionStatus> =
    isDeclared && isActual
      ? Option.some("managed-and-present")
      : isDeclared
        ? Option.some("managed-not-present")
        : isActual
          ? Option.some("unmanaged-present")
          : Option.none();
  return Option.map(status, (s) => ({
    scope,
    agentId,
    status: s,
    declared,
    actual,
  }));
};
