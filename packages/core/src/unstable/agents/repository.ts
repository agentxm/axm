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
import { Workspace } from "../workspace/service-interface.js";
import {
  type CodingAgent,
  CodingAgentRepository,
  type CodingAgentRepositoryService,
} from "./coding-agent.js";
import { claudeCodeCodingAgent } from "./claude-code/service.js";
import { codexCodingAgent } from "./codex/service.js";
import { cursorCodingAgent } from "./cursor/service.js";
import { geminiCliCodingAgent } from "./gemini-cli/service.js";
import { githubCopilotCodingAgent } from "./github-copilot/service.js";
import { opencodeCodingAgent } from "./opencode/service.js";
import { getAgentById, getAgentIds } from "./registry.js";
import type { AgentDescriptor, AgentId } from "./types.js";

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
});

const fromId = (id: AgentId): Effect.Effect<CodingAgent, AppError> => {
  switch (id) {
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
    case "opencode":
      return Effect.succeed(opencodeCodingAgent);
    default:
      return Option.match(getAgentById(id), {
        onNone: () =>
          Effect.fail(
            makeAppError({
              code: "CODING_AGENT_NOT_SUPPORTED",
              what: `Unsupported coding agent: ${id}`,
            }),
          ),
        onSome: (descriptor) => Effect.succeed(codingAgentFromDescriptor(descriptor)),
      });
  }
};

const get = (id: AgentId) =>
  Option.match(getAgentById(id), {
    onNone: () =>
      Effect.fail(
        makeAppError({
          code: "CODING_AGENT_NOT_SUPPORTED",
          what: `Unsupported coding agent: ${id}`,
        }),
      ),
    onSome: () => fromId(id),
  });

const all = Effect.forEach(getAgentIds(), (id) => fromId(id));

const getConfiguredAgentIds = () =>
  Workspace.asEffect().pipe(Effect.flatMap((ws) => ws.getConfiguredAgents()));

const getConfiguredAgents = () =>
  getConfiguredAgentIds().pipe(
    Effect.flatMap((ids) =>
      Effect.forEach(ids, (id) => {
        const descriptor = getAgentById(id);
        if (Option.isNone(descriptor)) return Effect.succeed(Option.none<CodingAgent>());
        return fromId(descriptor.value.id).pipe(Effect.map((agent) => Option.some(agent)));
      }),
    ),
    Effect.map(Array.getSomes),
  );

const getUnknownConfiguredAgentIds = () =>
  getConfiguredAgentIds().pipe(
    Effect.map((ids) => ids.filter((id) => Option.isNone(getAgentById(id)))),
  );

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
