/**
 * Catalog-derived agent projections and the scoped agent read-model API.
 *
 * All agents share the same declared, actual, and detected projectors. The
 * canonical capability catalog carries genuine per-agent variance, so adding
 * an agent does not require a placeholder module or registry edit here.
 */

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { AGENTS } from "../../../agents/registry.js";
import {
  AGENT_IDS,
  CONFIGURABLE_AGENT_IDS,
  isConfigurableAgentId,
  type AgentDescriptor,
  type AgentId,
  type ConfigurableAgentId,
} from "@agentxm/extension-model/unstable/agents/types";
import type { SettingsReadError } from "../errors.js";
import type { Scope } from "../types.js";
import {
  defineAgentModule,
  type ActualAgent,
  type AgentModule,
  type AgentScannerObservations,
  type DeclaredAgent,
  type DeclaredSettingsShape,
  type DetectedAgent,
} from "./types.js";

export type {
  ActualAgent,
  AgentModule,
  AgentScannerObservations,
  AgentSubjectType,
  DeclaredAgent,
  DeclaredSettingsShape,
  DetectedAgent,
  DetectionStatus,
} from "./types.js";

export { defineAgentModule } from "./types.js";

/** Every configurable catalog agent, in canonical order. */
export const registeredAgentModules: ReadonlyArray<AgentModule<ConfigurableAgentId>> =
  CONFIGURABLE_AGENT_IDS.map((agentId) =>
    defineAgentModule({ agentId, descriptor: AGENTS[agentId] }),
  );

/** Build the common projector module for one catalog agent. */
export const getAgentModule = <TId extends ConfigurableAgentId>(id: TId): AgentModule<TId> =>
  defineAgentModule({ agentId: id, descriptor: AGENTS[id] });

const isAgentId = (id: string): id is AgentId => Object.hasOwn(AGENTS, id);

/** Public shape of `ctx.scope(scope).agents`. */
export interface ScopedAgentsApi {
  readonly list: Effect.Effect<ReadonlyArray<AgentId>>;
  readonly known: Effect.Effect<ReadonlyArray<AgentDescriptor>>;
  readonly byId: (id: string) => Option.Option<AgentDescriptor>;
  readonly declared: (
    id: AgentId,
  ) => Effect.Effect<Option.Option<DeclaredAgent>, SettingsReadError>;
  readonly actual: (id: AgentId) => Effect.Effect<Option.Option<ActualAgent>>;
  readonly detected: Effect.Effect<ReadonlyArray<DetectedAgent>>;
}

/** Dependency-closed inputs captured by the scoped agent API. */
export interface ScopedAgentsApiDeps {
  readonly scope: Scope;
  readonly settings: Effect.Effect<Option.Option<DeclaredSettingsShape>, SettingsReadError>;
  readonly presence: Effect.Effect<ReadonlySet<AgentId>>;
  readonly observations: Effect.Effect<AgentScannerObservations>;
}

/** Build the agent portion of a scoped workspace read model. */
export const makeScopedAgentsApi = (deps: ScopedAgentsApiDeps): ScopedAgentsApi => {
  const { scope, settings, presence, observations } = deps;

  const declared = (id: AgentId) =>
    isConfigurableAgentId(id)
      ? settings.pipe(Effect.map((decoded) => getAgentModule(id).declared(scope, decoded)))
      : Effect.succeed(Option.none<DeclaredAgent>());

  const actual = (id: AgentId) =>
    isConfigurableAgentId(id)
      ? observations.pipe(Effect.map((obs) => getAgentModule(id).actual(scope, obs)))
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
        registeredAgentModules.map((module) =>
          module.detected(
            scope,
            module.declared(scope, decoded),
            presentAgentIds.has(module.agentId),
            module.actual(scope, obs),
          ),
        ),
      ),
    ),
  );

  return {
    list: Effect.succeed(AGENT_IDS),
    known: Effect.succeed(AGENT_IDS.map((id) => AGENTS[id])),
    byId: (id) => (isAgentId(id) ? Option.some(AGENTS[id]) : Option.none()),
    declared,
    actual,
    detected,
  };
};
