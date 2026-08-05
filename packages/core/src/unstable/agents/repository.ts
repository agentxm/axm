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
import {
  CONFIGURABLE_AGENT_IDS as CATALOG_AGENT_IDS,
  agentById,
  agentSupportsType,
  type ConfigurableAgentId as CatalogAgentId,
} from "../agent-capabilities/index.js";
import { type AppError, makeAppError } from "../app-error/index.js";
import { WorkspaceMutations } from "../workspace/service-interface.js";
import {
  type CodingAgent,
  CodingAgentRepository,
  type CodingAgentRepositoryService,
} from "./coding-agent.js";
import { addCommandViaResolve, removeCommandViaResolve } from "./command-sync.js";
import { augmentCodingAgent } from "./augment/service.js";
import { claudeCodeCodingAgent } from "./claude-code/service.js";
import { codexCodingAgent } from "./codex/service.js";
import { cursorCodingAgent } from "./cursor/service.js";
import { geminiCliCodingAgent } from "./gemini-cli/service.js";
import { githubCopilotCliCodingAgent } from "./github-copilot-cli/service.js";
import { junieCodingAgent } from "./junie/service.js";
import { kiloCodingAgent } from "./kilo/service.js";
import { kiroCliCodingAgent } from "./kiro-cli/service.js";
import { opencodeCodingAgent } from "./opencode/service.js";
import { rooCodingAgent } from "./roo/service.js";
import { addSubagentViaResolve, removeSubagentViaResolve } from "./subagent-sync.js";
import { userScopeRefusal } from "./scope-refusal.js";
import { windsurfCodingAgent } from "./windsurf/service.js";
import { addMcpServerFromManifest, removeMcpServerFromManifest } from "./mcp-sync.js";
import { AGENTS } from "./registry.js";
import { AGENT_IDS, isConfigurableAgentId } from "./types.js";
import type { AgentDescriptor, AgentId } from "./types.js";

const UNIVERSAL_AGENT_ID = "universal";

const isKnownAgentId = (id: string): id is AgentId => Object.hasOwn(AGENTS, id);

const catalogAgentIds = new Set<string>(CATALOG_AGENT_IDS);

const isCatalogAgentId = (id: string): id is CatalogAgentId => catalogAgentIds.has(id);

/**
 * Whether the capability catalog records a skills surface AXM can write for
 * this agent. Descriptors outside the catalog (`universal`) own their skills
 * directory outright and are always writable.
 */
const descriptorSupportsSkills = (descriptor: AgentDescriptor): boolean =>
  isCatalogAgentId(descriptor.id) ? agentSupportsType(agentById(descriptor.id), "skill") : true;

const codingAgentFromDescriptor = (descriptor: AgentDescriptor): CodingAgent => {
  const commandSyncConfig = { agentId: descriptor.id };
  const agent: CodingAgent = {
    id: descriptor.id,
    resolveEffectiveSkillsDir: ({ workspaceRoot }) =>
      Effect.gen(function* () {
        // Behavior-neutral today — every catalog agent supports skills — but
        // the resolve no longer assumes it. Without this an agent whose skill
        // capability AXM does not support would resolve an empty directory and
        // render into the workspace root.
        if (!descriptorSupportsSkills(descriptor)) {
          return {
            _tag: "unsupported",
            reason: `Skills are not supported for ${descriptor.id}`,
          } as const;
        }
        const path = yield* Path.Path;
        return {
          _tag: "supported",
          dir: path.resolve(workspaceRoot, descriptor.skills.dir),
        } as const;
      }),
    addMcpServer: (args) => addMcpServerFromManifest(descriptor.id, args),
    removeMcpServer: (args) => removeMcpServerFromManifest(descriptor.id, args),
    resolveEffectiveCommandsDir: ({ workspaceRoot, scope }) =>
      Effect.gen(function* () {
        if (descriptor.commands === undefined) {
          return {
            _tag: "unsupported",
            reason: `Commands are not supported for ${descriptor.id}`,
          } as const;
        }
        if (scope === "user") {
          return {
            _tag: "unsupported",
            reason: userScopeRefusal({
              agentId: descriptor.id,
              agentName: descriptor.name,
              type: "commands",
            }),
          } as const;
        }
        const path = yield* Path.Path;
        return {
          _tag: "supported",
          dir: path.resolve(workspaceRoot, descriptor.commands.dir),
          warnings: [],
        } as const;
      }),
    addCommand: (args) =>
      addCommandViaResolve(agent.resolveEffectiveCommandsDir(args), args, commandSyncConfig),
    removeCommand: (args) =>
      removeCommandViaResolve(agent.resolveEffectiveCommandsDir(args), args, commandSyncConfig),
    resolveEffectiveSubagentsDir: ({ workspaceRoot, scope }) =>
      Effect.gen(function* () {
        if (descriptor.subagents === undefined) {
          return {
            _tag: "unsupported",
            reason: `Subagents are not supported for ${descriptor.id}`,
          } as const;
        }
        if (scope === "user") {
          return {
            _tag: "unsupported",
            reason: userScopeRefusal({
              agentId: descriptor.id,
              agentName: descriptor.name,
              type: "subagents",
            }),
          } as const;
        }
        const path = yield* Path.Path;
        return {
          _tag: "supported",
          dir: path.resolve(workspaceRoot, descriptor.subagents.dir),
          warnings: [],
        } as const;
      }),
    addSubagent: (args) => addSubagentViaResolve(agent.resolveEffectiveSubagentsDir(args), args),
    removeSubagent: (args) =>
      removeSubagentViaResolve(agent.resolveEffectiveSubagentsDir(args), args),
  };
  return agent;
};

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
    case "github-copilot-cli":
      return Effect.succeed(githubCopilotCliCodingAgent);
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
    case "windsurf":
      return Effect.succeed(windsurfCodingAgent);
    default:
      return isKnownAgentId(id)
        ? Effect.succeed(codingAgentFromDescriptor(AGENTS[id]))
        : Effect.fail(
            makeAppError({
              code: "internal",
              detail: `Unsupported coding agent: ${id}`,
            }),
          );
  }
};

const get = (id: AgentId) => fromId(id);

const all = Effect.forEach(AGENT_IDS, (id) => fromId(id));

const getConfiguredAgentIds = () =>
  WorkspaceMutations.pipe(Effect.flatMap((ws) => ws.getConfiguredAgents()));

const getConfiguredAgents = () =>
  getConfiguredAgentIds().pipe(
    Effect.flatMap((ids) =>
      Effect.forEach(ids, (id) => {
        if (!isKnownAgentId(id)) return Effect.succeed(Option.none<CodingAgent>());
        if (!isConfigurableAgentId(id)) return Effect.succeed(Option.none<CodingAgent>());
        return fromId(id).pipe(Effect.map((agent) => Option.some(agent)));
      }),
    ),
    Effect.map(Array.getSomes),
  );

const getMaterializationAgents = () =>
  Effect.all([fromId(UNIVERSAL_AGENT_ID), getConfiguredAgents()]).pipe(
    Effect.map(([universalAgent, configuredAgents]) => [universalAgent, ...configuredAgents]),
  );

const getUnknownConfiguredAgentIds = () =>
  getConfiguredAgentIds().pipe(Effect.map((ids) => ids.filter((id) => !isKnownAgentId(id))));

export const DefaultCodingAgentRepository: CodingAgentRepositoryService = {
  get,
  all,
  getConfiguredAgents,
  getMaterializationAgents,
  getUnknownConfiguredAgentIds,
};

export const CodingAgentRepositoryLive = Layer.succeed(
  CodingAgentRepository,
  DefaultCodingAgentRepository,
);
