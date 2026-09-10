/**
 * Deterministic projection ports for feature tests.
 *
 * These stand in for the layers behind `./live` so a test can state exactly
 * which agents a workspace projects onto, which owners exist, and what the
 * invariant facts say, without a filesystem or a manager composition.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { codingAgentForId } from "@agentxm/agent-integration";
import type { AgentId } from "@agentxm/extension-model/unstable/agents/types";
import {
  CodingAgentRepository,
  type CodingAgentRepositoryService,
} from "./agents/coding-agent-repository.js";
import {
  allCodingAgents,
  configuredCodingAgents,
  materializationCodingAgents,
  unknownConfiguredAgentIds,
} from "./agents/selection.js";
import {
  emptyProjectionParticipants,
  ProjectionParticipants,
  type ProjectionParticipant,
  type ProjectionParticipantsService,
  type SubagentProjectionObserver,
} from "./participants.js";
import { WorkspaceInvariantFacts, type ProjectionInvariantFact } from "./invariant-facts.js";

/**
 * A repository over a fixed configured-agent list. It makes the same
 * selection decisions the live repository does, without reading settings.
 */
export const makeCodingAgentRepository = (
  configuredAgentIds: ReadonlyArray<string>,
): CodingAgentRepositoryService => ({
  get: (id: AgentId) => Effect.succeed(codingAgentForId(id)),
  all: Effect.sync(allCodingAgents),
  getConfiguredAgents: () => Effect.succeed(configuredCodingAgents(configuredAgentIds)),
  getMaterializationAgents: () => Effect.succeed(materializationCodingAgents(configuredAgentIds)),
  getUnknownConfiguredAgentIds: () => Effect.succeed(unknownConfiguredAgentIds(configuredAgentIds)),
});

/** Layer form of {@link makeCodingAgentRepository}. */
export const codingAgentRepositoryLayer = (
  configuredAgentIds: ReadonlyArray<string>,
): Layer.Layer<CodingAgentRepository> =>
  Layer.succeed(CodingAgentRepository, makeCodingAgentRepository(configuredAgentIds));

/** A workspace that projects onto the universal agent only. */
export const UniversalCodingAgentRepository: Layer.Layer<CodingAgentRepository> =
  codingAgentRepositoryLayer([]);

/** A participant registry with the owners a test declares, and no others. */
export const makeProjectionParticipants = (args: {
  readonly aggregates?: ReadonlyArray<ProjectionParticipant>;
  readonly subagents?: SubagentProjectionObserver;
}): ProjectionParticipantsService => ({
  aggregates: args.aggregates ?? [],
  subagents: args.subagents === undefined ? Option.none() : Option.some(args.subagents),
});

/** Layer form of {@link makeProjectionParticipants}. */
export const projectionParticipantsLayer = (args: {
  readonly aggregates?: ReadonlyArray<ProjectionParticipant>;
  readonly subagents?: SubagentProjectionObserver;
}): Layer.Layer<ProjectionParticipants> =>
  Layer.succeed(ProjectionParticipants, makeProjectionParticipants(args));

/** No owners: every projection fact comes from workspace state alone. */
export const NoProjectionParticipants: Layer.Layer<ProjectionParticipants> = Layer.succeed(
  ProjectionParticipants,
  emptyProjectionParticipants,
);

/** Facts a test states outright, for consumers that only read them. */
export const workspaceInvariantFactsLayer = (
  facts: ReadonlyArray<ProjectionInvariantFact>,
): Layer.Layer<WorkspaceInvariantFacts> =>
  Layer.succeed(WorkspaceInvariantFacts, { projectionFacts: Effect.succeed(facts) });
