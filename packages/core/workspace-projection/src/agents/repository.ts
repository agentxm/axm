/**
 * Coding-agent repository: which agents this workspace projects onto.
 *
 * Selecting the configured and materialization agents is a workspace
 * decision made from settings; the decision itself is pure (`selection.ts`)
 * and the per-agent adapters come from `@agentxm/agent-integration`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { codingAgentForId, type CodingAgent } from "@agentxm/agent-integration";
import { WorkspaceMutations } from "@agentxm/workspace-state";
import type { AgentId } from "@agentxm/extension-model/unstable/agents/types";
import {
  CodingAgentRepository,
  type CodingAgentRepositoryService,
} from "./coding-agent-repository.js";
import {
  allCodingAgents,
  configuredCodingAgents,
  materializationCodingAgents,
  unknownConfiguredAgentIds,
} from "./selection.js";

const configuredAgentIds = () =>
  WorkspaceMutations.pipe(Effect.flatMap((ws) => ws.getConfiguredAgents()));

export const DefaultCodingAgentRepository: CodingAgentRepositoryService = {
  get: (id: AgentId): Effect.Effect<CodingAgent> => Effect.succeed(codingAgentForId(id)),
  all: Effect.sync(allCodingAgents),
  getConfiguredAgents: () => configuredAgentIds().pipe(Effect.map(configuredCodingAgents)),
  getMaterializationAgents: () =>
    configuredAgentIds().pipe(Effect.map(materializationCodingAgents)),
  getUnknownConfiguredAgentIds: () =>
    configuredAgentIds().pipe(Effect.map(unknownConfiguredAgentIds)),
};

export const CodingAgentRepositoryLive = Layer.succeed(
  CodingAgentRepository,
  DefaultCodingAgentRepository,
);
