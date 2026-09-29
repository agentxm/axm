/**
 * Coding-agent repository: which agents this workspace projects onto.
 *
 * Selecting the configured and materialization agents is a workspace
 * decision made from settings; the decision itself is pure (`selection.ts`)
 * and the per-agent adapters come from `@agentxm/workspace-kernel/agent-adapters`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { codingAgentForId, type CodingAgent } from "../../agent-adapters/index.js";
import type { NativeDirectoryInputs } from "../../locations/index.js";
import { WorkspaceLocation, SettingsReader } from "../../workspace-state/index.js";
import type { MaterializationTargetId } from "@agentxm/extension-model/unstable/agents/types";
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
  SettingsReader.pipe(Effect.flatMap((settings) => settings.configuredAgents));

export const makeCodingAgentRepositoryService = (
  inputs: NativeDirectoryInputs,
): CodingAgentRepositoryService => ({
  get: (id: MaterializationTargetId): Effect.Effect<CodingAgent> =>
    Effect.succeed(codingAgentForId(id, inputs)),
  all: Effect.sync(() => allCodingAgents(inputs)),
  getConfiguredAgents: () =>
    configuredAgentIds().pipe(Effect.map((ids) => configuredCodingAgents(ids, inputs))),
  getMaterializationAgents: () =>
    configuredAgentIds().pipe(Effect.map((ids) => materializationCodingAgents(ids, inputs))),
  getUnknownConfiguredAgentIds: () =>
    configuredAgentIds().pipe(Effect.map(unknownConfiguredAgentIds)),
});

export const CodingAgentRepositoryLive = Layer.effect(
  CodingAgentRepository,
  Effect.map(WorkspaceLocation, (location) =>
    makeCodingAgentRepositoryService(location.nativeDirectoryInputs),
  ),
);
