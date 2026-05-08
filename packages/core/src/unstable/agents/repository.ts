/**
 * Coding agent repository implementation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { type AppError, makeAppError } from "../app-error/index.js";
import { WorkspaceMutations } from "../workspace/service-interface.js";
import {
  type CodingAgent,
  CodingAgentRepository,
  type CodingAgentRepositoryService,
} from "./coding-agent.js";
import { augmentCodingAgent } from "./augment/service.js";
import { claudeCodeCodingAgent } from "./claude-code/service.js";
import { codexCodingAgent } from "./codex/service.js";
import { cursorCodingAgent } from "./cursor/service.js";
import { geminiCliCodingAgent } from "./gemini-cli/service.js";
import { githubCopilotCodingAgent } from "./github-copilot/service.js";
import { junieCodingAgent } from "./junie/service.js";
import { kiloCodingAgent } from "./kilo/service.js";
import { kiroCliCodingAgent } from "./kiro-cli/service.js";
import { opencodeCodingAgent } from "./opencode/service.js";
import { rooCodingAgent } from "./roo/service.js";
import { AGENTS } from "./registry.js";
import { AGENT_IDS } from "./types.js";
import type { AgentDescriptor, AgentId } from "./types.js";

const isKnownAgentId = (id: string): id is AgentId => Object.hasOwn(AGENTS, id);

const codingAgentFromDescriptor = (descriptor: AgentDescriptor): CodingAgent => ({
  id: descriptor.id,
  resolveEffectiveSkillsDir: ({ workspaceRoot }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      return {
        _tag: "supported",
        dir: path.resolve(workspaceRoot, descriptor.skills.dir),
      } as const;
    }),
  addMcpServer: () =>
    Effect.succeed({
      _tag: "unsupported",
      reason: `MCP add is not supported for ${descriptor.id}`,
    } as const),
  removeMcpServer: () =>
    Effect.succeed({
      _tag: "unsupported",
      reason: `MCP remove is not supported for ${descriptor.id}`,
    } as const),
  resolveEffectiveCommandsDir: () =>
    Effect.succeed({
      _tag: "unsupported",
      reason: `Commands are not supported for ${descriptor.id}`,
    } as const),
  addCommand: () =>
    Effect.succeed({
      _tag: "unsupported",
      reason: `Command add is not supported for ${descriptor.id}`,
    } as const),
  removeCommand: () =>
    Effect.succeed({
      _tag: "unsupported",
      reason: `Command remove is not supported for ${descriptor.id}`,
    } as const),
  resolveEffectiveSubagentsDir: () =>
    Effect.succeed({
      _tag: "unsupported",
      reason: `Subagents are not supported for ${descriptor.id}`,
    } as const),
  addSubagent: () =>
    Effect.succeed({
      _tag: "unsupported",
      reason: `Subagent add is not supported for ${descriptor.id}`,
    } as const),
  removeSubagent: () =>
    Effect.succeed({
      _tag: "unsupported",
      reason: `Subagent remove is not supported for ${descriptor.id}`,
    } as const),
});

const fromId = (id: AgentId): Effect.Effect<CodingAgent, AppError> => {
  switch (id) {
    case "augment":
      return Effect.succeed(augmentCodingAgent);
    case "claude-code":
      return Effect.succeed(claudeCodeCodingAgent);
    case "codex":
      return Effect.succeed(codexCodingAgent);
    case "cursor":
      return Effect.succeed(cursorCodingAgent);
    case "gemini-cli":
      return Effect.succeed(geminiCliCodingAgent);
    case "github-copilot":
      return Effect.succeed(githubCopilotCodingAgent);
    case "junie":
      return Effect.succeed(junieCodingAgent);
    case "kilo":
      return Effect.succeed(kiloCodingAgent);
    case "kiro-cli":
      return Effect.succeed(kiroCliCodingAgent);
    case "opencode":
      return Effect.succeed(opencodeCodingAgent);
    case "roo":
      return Effect.succeed(rooCodingAgent);
    default:
      return isKnownAgentId(id)
        ? Effect.succeed(codingAgentFromDescriptor(AGENTS[id]))
        : Effect.fail(
            makeAppError({
              code: "CODING_AGENT_NOT_SUPPORTED",
              category: "internal",
              message: `Unsupported coding agent: ${id}`,
            }),
          );
  }
};

const get = (id: AgentId) => fromId(id);

const all = Effect.forEach(AGENT_IDS, (id) => fromId(id));

const getConfiguredAgentIds = () =>
  WorkspaceMutations.asEffect().pipe(Effect.flatMap((ws) => ws.getConfiguredAgents()));

const getConfiguredAgents = () =>
  getConfiguredAgentIds().pipe(
    Effect.flatMap((ids) =>
      Effect.forEach(ids, (id) => {
        if (!isKnownAgentId(id)) return Effect.succeed(Option.none<CodingAgent>());
        return fromId(id).pipe(Effect.map((agent) => Option.some(agent)));
      }),
    ),
    Effect.map(Array.getSomes),
  );

const getUnknownConfiguredAgentIds = () =>
  getConfiguredAgentIds().pipe(Effect.map((ids) => ids.filter((id) => !isKnownAgentId(id))));

export const DefaultCodingAgentRepository: CodingAgentRepositoryService = {
  get,
  all,
  getConfiguredAgents,
  getUnknownConfiguredAgentIds,
};

export const CodingAgentRepositoryLive = Layer.succeed(
  CodingAgentRepository,
  DefaultCodingAgentRepository,
);
