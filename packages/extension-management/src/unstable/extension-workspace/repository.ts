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
} from "@agentxm/extension-model/unstable/agent-capabilities";
import type { AppError } from "../app-error/index.js";
import { WorkspaceMutations } from "../workspace/service-interface.js";
import {
  type CodingAgent,
  CodingAgentRepository,
  type CodingAgentRepositoryService,
} from "./coding-agent.js";
import { envOption } from "../utils/index.js";
import {
  addRooSubagent,
  addSubagentViaResolve,
  dirOutcomeToSubagentSyncOutcome,
  removeRooSubagent,
  removeSubagentViaResolve,
} from "./subagent-sync.js";
import { userScopeRefusal } from "../workspace/scope-refusal.js";
import { getHome } from "../agents/constants.js";
import { addMcpServerFromManifest, removeMcpServerFromManifest } from "./mcp-sync.js";
import { AGENTS } from "@agentxm/extension-model/unstable/agents/registry";
import { AGENT_IDS, isConfigurableAgentId } from "@agentxm/extension-model/unstable/agents/types";
import type { AgentDescriptor, AgentId } from "@agentxm/extension-model/unstable/agents/types";
import { toAppError } from "../app-error/conversions.js";

const UNIVERSAL_AGENT_ID = "universal";

const isKnownAgentId = (id: string): id is AgentId => Object.hasOwn(AGENTS, id);

const catalogAgentIds = new Set<string>(CATALOG_AGENT_IDS);

const isCatalogAgentId = (id: string): id is CatalogAgentId => catalogAgentIds.has(id);

interface AgentRuntimeOverride {
  readonly skillsDirectoryEnvironment?: string;
  readonly subagentRenderAgentId?: string;
  readonly subagentStorage?: "roo";
}

const AGENT_RUNTIME_OVERRIDES: Readonly<Partial<Record<AgentId, AgentRuntimeOverride>>> = {
  "claude-code": { skillsDirectoryEnvironment: "AXM_CLAUDE_SKILLS_DIR" },
  "gemini-cli": { skillsDirectoryEnvironment: "AXM_GEMINI_CLI_SKILLS_DIR" },
  "kiro-cli": { subagentRenderAgentId: "kiro" },
  roo: { subagentStorage: "roo" },
};

const descriptorSupports = (
  descriptor: AgentDescriptor,
  type: "mcp-server" | "skill" | "subagent",
): boolean =>
  isCatalogAgentId(descriptor.id)
    ? agentSupportsType(agentById(descriptor.id), type)
    : type === "skill" && descriptor.skills !== undefined;

const codingAgentFromDescriptor = (descriptor: AgentDescriptor): CodingAgent => {
  const runtimeOverride = AGENT_RUNTIME_OVERRIDES[descriptor.id];
  const agent: CodingAgent = {
    id: descriptor.id,
    resolveEffectiveSkillsDir: ({ workspaceRoot }) =>
      Effect.gen(function* () {
        if (descriptor.skills === undefined || !descriptorSupports(descriptor, "skill")) {
          return {
            _tag: "unsupported",
            reason: `Skills are not supported for ${descriptor.id}`,
          } as const;
        }
        const path = yield* Path.Path;
        const environmentName = runtimeOverride?.skillsDirectoryEnvironment;
        if (environmentName !== undefined) {
          const configuredDirectory = yield* envOption(environmentName);
          if (Option.isSome(configuredDirectory)) {
            if (configuredDirectory.value.trim().length === 0) {
              return {
                _tag: "misconfigured",
                reason: `${environmentName} is set but empty`,
              } as const;
            }
            return {
              _tag: "supported",
              dir: path.resolve(workspaceRoot, configuredDirectory.value),
            } as const;
          }
        }
        return {
          _tag: "supported",
          dir: path.resolve(workspaceRoot, descriptor.skills.dir),
        } as const;
      }),
    addMcpServer: descriptorSupports(descriptor, "mcp-server")
      ? (args) => addMcpServerFromManifest(descriptor.id, args)
      : () =>
          Effect.succeed({
            _tag: "unsupported",
            reason: `MCP add is not supported for ${descriptor.id}`,
          } as const),
    removeMcpServer: descriptorSupports(descriptor, "mcp-server")
      ? (args) => removeMcpServerFromManifest(descriptor.id, args)
      : () =>
          Effect.succeed({
            _tag: "unsupported",
            reason: `MCP remove is not supported for ${descriptor.id}`,
          } as const),
    resolveEffectiveSubagentsDir: ({ workspaceRoot, scope }) =>
      Effect.gen(function* () {
        if (descriptor.subagents === undefined || !descriptorSupports(descriptor, "subagent")) {
          return {
            _tag: "unsupported",
            reason: `Subagents are not supported for ${descriptor.id}`,
          } as const;
        }
        if (!descriptor.subagents.scopes.includes(scope)) {
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
        if (scope === "user") {
          const home = yield* getHome;
          return {
            _tag: "supported",
            dir: path.join(home, descriptor.subagents.dir),
            warnings: [],
          } as const;
        }
        return {
          _tag: "supported",
          dir: path.resolve(workspaceRoot, descriptor.subagents.dir),
          warnings: [],
        } as const;
      }),
    addSubagent: (args) => {
      const resolution = agent.resolveEffectiveSubagentsDir(args);
      if (runtimeOverride?.subagentStorage === "roo") {
        return Effect.flatMap(resolution, (outcome) =>
          outcome._tag === "supported"
            ? addRooSubagent(outcome.dir, args)
            : Effect.succeed(dirOutcomeToSubagentSyncOutcome(outcome)),
        );
      }
      const effectiveArgs =
        runtimeOverride?.subagentRenderAgentId === undefined
          ? args
          : {
              ...args,
              input: { ...args.input, agentId: runtimeOverride.subagentRenderAgentId },
            };
      return addSubagentViaResolve(resolution, effectiveArgs);
    },
    removeSubagent: (args) => {
      const resolution = agent.resolveEffectiveSubagentsDir(args);
      if (runtimeOverride?.subagentStorage === "roo") {
        return Effect.flatMap(resolution, (outcome) =>
          outcome._tag === "supported"
            ? removeRooSubagent(outcome.dir, args.subagentName)
            : Effect.succeed(dirOutcomeToSubagentSyncOutcome(outcome)),
        );
      }
      return removeSubagentViaResolve(resolution, args);
    },
  };
  return agent;
};

/** @experimental This API is unstable and may change without notice. */
export const codingAgentForId = (id: AgentId): CodingAgent => codingAgentFromDescriptor(AGENTS[id]);

const fromId = (id: AgentId): Effect.Effect<CodingAgent, AppError> =>
  Effect.succeed(codingAgentForId(id));

const get = (id: AgentId) => fromId(id);

const all = Effect.forEach(AGENT_IDS, (id) => fromId(id));

const getConfiguredAgentIds = () =>
  WorkspaceMutations.pipe(
    Effect.flatMap((ws) => ws.getConfiguredAgents().pipe(Effect.mapError(toAppError))),
  );

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
