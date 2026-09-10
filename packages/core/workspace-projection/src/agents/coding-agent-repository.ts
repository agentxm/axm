/**
 * The coding-agent repository service.
 *
 * The per-agent adapter contract (`CodingAgent`) is native format mechanics
 * and lives in `@agentxm/agent-integration`; deciding which agents a
 * workspace projects onto is a core decision, so the repository that answers
 * it lives here.
 *
 * The settings-derived members keep `WorkspaceMutations` in `R`. The decisions
 * themselves are pure over the configured agent IDs (`selection.ts`), so a
 * caller that already holds those IDs never needs the service at all.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type * as Effect from "effect/Effect";
import * as ServiceMap from "effect/Context";
import type { CodingAgent } from "@agentxm/agent-integration";
import type { AgentId } from "@agentxm/extension-model/unstable/agents/types";
import type { WorkspaceMutations, WorkspaceSettingsReadFailure } from "@agentxm/workspace-state";

/** Repository for coding-agent implementations. */
export interface CodingAgentRepositoryService {
  readonly get: (id: AgentId) => Effect.Effect<CodingAgent>;
  readonly all: Effect.Effect<ReadonlyArray<CodingAgent>>;
  readonly getConfiguredAgents: () => Effect.Effect<
    ReadonlyArray<CodingAgent>,
    WorkspaceSettingsReadFailure,
    WorkspaceMutations
  >;
  readonly getMaterializationAgents: () => Effect.Effect<
    ReadonlyArray<CodingAgent>,
    WorkspaceSettingsReadFailure,
    WorkspaceMutations
  >;
  readonly getUnknownConfiguredAgentIds: () => Effect.Effect<
    ReadonlyArray<string>,
    WorkspaceSettingsReadFailure,
    WorkspaceMutations
  >;
}

export class CodingAgentRepository extends ServiceMap.Service<
  CodingAgentRepository,
  CodingAgentRepositoryService
>()("@agentxm/workspace-projection/agents/CodingAgentRepository") {}
