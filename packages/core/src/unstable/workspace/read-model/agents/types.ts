/**
 * Shared per-agent types used by every per-agent module under `agents/<id>.ts`
 * and by the registry barrel `agents/index.ts`.
 *
 * Per Decision 3 (agents have declared + actual only; no resolved layer) and
 * Decision 4 (per-subject modules carry the genuine variance) of the
 * workspace read-model design:
 *
 * - `DeclaredAgent` / `ActualAgent` / `DetectedAgent` are the per-agent
 *   payload shapes the projectors return through `Option`.
 * - `AgentModule<TNativeConfig, TId>` is the contract every per-agent file
 *   under `agents/<id>.ts` exports; the registry barrel collects them into
 *   `registeredAgentModules`.
 * - `AgentScannerObservations` is the input projector helpers consume from the
 *   live composition (Phase 9). It carries the agent-specific slice of scanner
 *   outputs — directly observable evidence that this agent has any presence in
 *   the workspace.
 *
 * `AgentSubjectType` mirrors `scanners/types.ts#AgentDirSubjectType` so the
 * agent registry barrel does not need to import scanner types at runtime.
 */

import type * as Option from "effect/Option";
import type { AgentDescriptor, AgentId } from "../../../agents/types.js";
import type {
  AgentDirOccurrence,
  AgentSettingsOccurrence,
  McpConfigOccurrence,
} from "../scanners/types.js";
import type { Scope } from "../types.js";
import { defaultActual, defaultDeclared, defaultDetected } from "./shared.js";

// ---------------------------------------------------------------------------
// Agent subject support
// ---------------------------------------------------------------------------

/**
 * Subject types renderable into per-agent directories. Mirrors the
 * `AgentDirSubjectType` discriminator on the agent-dir scanner. Per-agent
 * modules expose the subjects they support so the registry barrel can answer
 * "which subjects does this agent render?" without re-scanning the agent
 * registry.
 */
export type AgentSubjectType = "skill" | "subagent";

// ---------------------------------------------------------------------------
// Declared agent
// ---------------------------------------------------------------------------

/**
 * Settings-derived declaration of an agent for a given scope. Produced by the
 * per-agent `declared(scope, settings)` projector when the scope's
 * `axm.json` lists the agent in its `agents` array.
 */
export interface DeclaredAgent {
  readonly scope: Scope;
  readonly agentId: AgentId;
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
export interface ActualAgent {
  readonly scope: Scope;
  readonly agentId: AgentId;
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
export type DetectionStatus = "managed-and-present" | "managed-not-present" | "unmanaged-present";

export interface DetectedAgent {
  readonly scope: Scope;
  readonly agentId: AgentId;
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
 * narrows scanner outputs by `agentId` once and threads the result into each
 * per-agent module's `actual` projector.
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
// Settings shape consumed by `declared`
// ---------------------------------------------------------------------------

/**
 * Subset of decoded `axm.json` the agent `declared` projectors need.
 * Phase 8 modules accept this narrowed shape so they can be unit-tested
 * without depending on the full Settings schema.
 */
export interface DeclaredSettingsShape {
  readonly agents?: ReadonlyArray<AgentId>;
}

// ---------------------------------------------------------------------------
// AgentModule contract
// ---------------------------------------------------------------------------

/**
 * Contract every per-agent module under `agents/<id>.ts` exports. The registry
 * barrel collects modules into `registeredAgentModules` and exposes the open
 * `AgentNativeConfig` union as the union of every module's `TNativeConfig`
 * variant.
 *
 * The generic `TNativeConfig` constrains future native-config variants to
 * keep the `agentId` discriminator so the open union remains well-formed.
 * `TId` narrows the module's `agentId` to a single literal when known.
 */
export interface AgentModule<
  TNativeConfig extends { readonly agentId: TId },
  TId extends AgentId = AgentId,
> {
  readonly agentId: TId;
  readonly subjects: ReadonlyArray<AgentSubjectType>;
  readonly declared: (
    scope: Scope,
    settings: Option.Option<DeclaredSettingsShape>,
  ) => Option.Option<DeclaredAgent>;
  readonly actual: (
    scope: Scope,
    observations: AgentScannerObservations,
  ) => Option.Option<ActualAgent>;
  readonly detected: (
    scope: Scope,
    declared: Option.Option<DeclaredAgent>,
    present: boolean,
    actual: Option.Option<ActualAgent>,
  ) => Option.Option<DetectedAgent>;
  readonly _nativeConfig?: TNativeConfig;
}

// ---------------------------------------------------------------------------
// defineAgentModule factory
// ---------------------------------------------------------------------------

/**
 * Inputs to `defineAgentModule`. The factory derives `subjects` from the
 * descriptor (see Decision 4) so per-agent files don't repeat the scanner-relevant subject list.
 */
export interface DefineAgentModuleInput<TId extends AgentId> {
  readonly agentId: TId;
  readonly descriptor: AgentDescriptor;
}

/**
 * Derive the subjects the agent renders into per-agent directories from its
 * descriptor. `skills` is always present on an `AgentDescriptor`; `subagents`
 * are optional.
 */
const subjectsFromDescriptor = (descriptor: AgentDescriptor): ReadonlyArray<AgentSubjectType> => {
  const out: Array<AgentSubjectType> = ["skill"];
  if (descriptor.subagents !== undefined) out.push("subagent");
  return out;
};

/**
 * Build a complete `AgentModule` for `agentId`. The projectors call the v1
 * `defaultDeclared` / `defaultActual` / `defaultDetected` helpers from
 * `shared.ts`. `subjects` is derived from `descriptor`.
 *
 * Per-agent files become a per-agent native-config interface declaration plus
 * a single `defineAgentModule({ agentId, descriptor })` call.
 */
export const defineAgentModule = <
  TId extends AgentId,
  TNativeConfig extends { readonly agentId: TId },
>(
  input: DefineAgentModuleInput<TId>,
): AgentModule<TNativeConfig, TId> => {
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
