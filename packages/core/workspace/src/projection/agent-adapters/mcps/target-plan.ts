/**
 * The one decision of what each configured agent's native configuration
 * should hold for one MCP connection.
 *
 * Agents that read the same native file are planned as one group: the file
 * gets one entry every reader accepts, or the whole group is blocked. A
 * reader that cannot represent the shared entry blocks its co-readers rather
 * than being skipped, because the file has one shape. The writer, the
 * inspector, and the lint drift rule all consume this plan, so the entry a
 * writer renders is the entry an inspector expects.
 *
 * @experimental This API is unstable and may change without notice.
 */

import {
  CONFIGURABLE_AGENTS_BY_ID,
  type Agent,
  type ConfigurableAgentId,
  type McpConfig,
  type McpConfigTarget,
  type McpTransport,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import type { McpServerManifest } from "@agentxm/extension-model/unstable/mcps/manifest-schema";
import {
  inferInlineRemoteTransport,
  projectExpectedEntry,
  type McpServerDeclaration,
} from "./expected-entry.js";
import { resolveMcpServer, type McpResolution } from "./resolution.js";
import {
  resolveSharedMcpTarget,
  type SharedMcpTargetMember,
  type SharedMcpTransport,
} from "./shared-target.js";
import { groupConfiguredMcpTargets } from "./targeting.js";

type AgentMcpCapability = Agent["capabilities"]["mcp-server"];
type ConfiguredMcpCapability = AgentMcpCapability & {
  readonly native: Extract<
    AgentMcpCapability["native"],
    { readonly transports: ReadonlyArray<McpTransport> }
  >;
  readonly axm: {
    readonly writer: {
      readonly config: McpConfig;
    };
  };
};

const hasMcpConfig = (capability: AgentMcpCapability): capability is ConfiguredMcpCapability =>
  capability.axm.writer !== null && "transports" in capability.native;

const isCapabilityAgentId = (agentId: string): agentId is ConfigurableAgentId =>
  agentId in CONFIGURABLE_AGENTS_BY_ID;

/** The MCP capability of an agent that can write native configuration, if it can. */
export const configuredMcpCapability = (agentId: string): ConfiguredMcpCapability | undefined => {
  if (!isCapabilityAgentId(agentId)) return undefined;
  const capability = CONFIGURABLE_AGENTS_BY_ID[agentId].capabilities["mcp-server"];
  return hasMcpConfig(capability) ? capability : undefined;
};

export interface PlanMcpServerTargetsArgs {
  readonly agentIds: ReadonlyArray<string>;
  readonly scope: "project" | "user";
  readonly serverName: string;
  readonly declaration: McpServerDeclaration;
  /** The canonical manifest of a sourced connection; absent for an inline one. */
  readonly manifest?: McpServerManifest | undefined;
  /** The projection input values, with every secret supplied as its reference. */
  readonly values: Readonly<Record<string, string>>;
  readonly enabled: boolean;
}

interface PlannedTarget {
  readonly agentId: string;
  readonly config: McpConfig;
  readonly target: McpConfigTarget;
}

export type McpAgentTargetPlan =
  | {
      readonly _tag: "unsupported";
      readonly agentId: string;
      readonly reason: string;
      readonly target?: McpConfigTarget;
    }
  | {
      readonly _tag: "nothing-runnable";
      readonly agentId: string;
      readonly reason: string;
      readonly target: McpConfigTarget;
    }
  | (PlannedTarget & { readonly _tag: "blocked"; readonly reason: string })
  | (PlannedTarget & {
      readonly _tag: "needs-input";
      readonly entry: Readonly<Record<string, unknown>>;
      readonly warnings: ReadonlyArray<string>;
      readonly missing: ReadonlyArray<string>;
    })
  | (PlannedTarget & {
      readonly _tag: "projected";
      readonly entry: Readonly<Record<string, unknown>>;
      readonly warnings: ReadonlyArray<string>;
      readonly shimmed: boolean;
    });

/** One native file to write: the entry its readers share. */
export interface McpTargetWrite {
  readonly path: string;
  readonly config: McpConfig;
  readonly target: McpConfigTarget;
  readonly entry: Readonly<Record<string, unknown>>;
  readonly agentIds: ReadonlyArray<string>;
}

export type McpTargetPlan =
  | { readonly _tag: "invalid"; readonly detail: string; readonly cause?: unknown }
  | {
      readonly _tag: "planned";
      /** One plan per requested agent, in request order. */
      readonly agents: ReadonlyArray<McpAgentTargetPlan>;
      readonly writes: ReadonlyArray<McpTargetWrite>;
    };

type RunnableMcpResolution = Extract<McpResolution, { readonly _tag: "resolved" | "needs-input" }>;

const isRunnable = (resolution: McpResolution): resolution is RunnableMcpResolution =>
  resolution._tag === "resolved" || resolution._tag === "needs-input";

const unreadableShared = (agentId: string, path: string, reason: string): string =>
  `${agentId} cannot read shared MCP target '${path}': ${reason}`;

const blockedGroup = (
  members: ReadonlyArray<SharedMcpTargetMember>,
  reason: string,
): ReadonlyArray<McpAgentTargetPlan> =>
  members.map((member) => ({
    _tag: "blocked",
    agentId: member.agentId,
    config: member.config,
    target: member.target,
    reason,
  }));

const inlineTransport = (
  declaration: McpServerDeclaration,
):
  | { readonly _tag: "transport"; readonly transport: SharedMcpTransport }
  | { readonly _tag: "invalid"; readonly detail: string; readonly cause?: unknown } => {
  if (declaration.command !== undefined) return { _tag: "transport", transport: "stdio" };
  if (declaration.url !== undefined) {
    const inference = inferInlineRemoteTransport(declaration.url);
    return inference._tag === "supported"
      ? { _tag: "transport", transport: inference.transport }
      : { _tag: "invalid", detail: "Invalid inline MCP server URL", cause: inference.reason };
  }
  return { _tag: "invalid", detail: "Inline MCP server has no command or URL" };
};

const planInlineGroup = (
  args: PlanMcpServerTargetsArgs,
  members: ReadonlyArray<SharedMcpTargetMember>,
  transport: SharedMcpTransport,
): { readonly agents: ReadonlyArray<McpAgentTargetPlan>; readonly write?: McpTargetWrite } => {
  const shared = resolveSharedMcpTarget({ members, transport });
  if (shared._tag === "conflict") return { agents: blockedGroup(members, shared.reason) };
  const projected = members.map((member) => ({
    member,
    result: projectExpectedEntry({
      serverName: args.serverName,
      entry: args.declaration,
      stdio: shared.config.stdio,
      remote: shared.config.remote,
      activationField: shared.config.activationField,
      envExpansion: configuredMcpCapability(member.agentId)?.native.mcpEnvExpansion,
    }),
  }));
  const unsupported = projected.find((item) => item.result._tag === "unsupported");
  if (unsupported !== undefined && unsupported.result._tag === "unsupported") {
    return {
      agents: blockedGroup(
        members,
        unreadableShared(unsupported.member.agentId, shared.path, unsupported.result.reason),
      ),
    };
  }
  const first = projected[0]?.result;
  if (first === undefined || first._tag !== "projected") {
    return {
      agents: blockedGroup(members, `MCP config target '${shared.path}' has no readers`),
    };
  }
  return {
    agents: projected.map(({ member, result }) => ({
      _tag: "projected",
      agentId: member.agentId,
      config: shared.config,
      target: member.target,
      entry: first.entry,
      warnings: result._tag === "projected" ? result.warnings : [],
      shimmed: false,
    })),
    write: {
      path: shared.path,
      config: shared.config,
      target: shared.target,
      entry: first.entry,
      agentIds: members.map((member) => member.agentId),
    },
  };
};

const planManifestGroup = (
  args: PlanMcpServerTargetsArgs,
  manifest: McpServerManifest,
  members: ReadonlyArray<SharedMcpTargetMember>,
): { readonly agents: ReadonlyArray<McpAgentTargetPlan>; readonly write?: McpTargetWrite } => {
  const path = members[0]?.target.path ?? "unknown";
  const resolve = (member: SharedMcpTargetMember, config: McpConfig): McpResolution => {
    const capability = configuredMcpCapability(member.agentId);
    if (capability === undefined) {
      return { _tag: "no-distribution", reason: "agent does not have MCP config support" };
    }
    return resolveMcpServer({
      manifest,
      localName: args.serverName,
      capability: { ...capability, axm: { ...capability.axm, writer: { config } } },
      values: args.values,
      enabled: args.enabled,
    });
  };
  const initial = members.map((member) => ({ member, resolution: resolve(member, member.config) }));
  const runnable = initial.filter(({ resolution }) => isRunnable(resolution));
  if (runnable.length === 0) {
    return {
      agents: initial.map(({ member, resolution }) => ({
        _tag: resolution._tag === "nothing-runnable" ? "nothing-runnable" : "unsupported",
        agentId: member.agentId,
        target: member.target,
        reason: isRunnable(resolution) ? "" : resolution.reason,
      })),
    };
  }
  const unavailable = initial.find(({ resolution }) => !isRunnable(resolution));
  if (unavailable !== undefined && !isRunnable(unavailable.resolution)) {
    return {
      agents: blockedGroup(
        members,
        unreadableShared(unavailable.member.agentId, path, unavailable.resolution.reason),
      ),
    };
  }
  const transports = new Set(
    runnable.flatMap(({ resolution }) => (isRunnable(resolution) ? [resolution.transport] : [])),
  );
  if (transports.size > 1) {
    return {
      agents: blockedGroup(
        members,
        `MCP config target '${path}' resolves to incompatible transports for ${members.map(({ agentId }) => agentId).join(", ")}`,
      ),
    };
  }
  const transport = [...transports][0];
  if (transport === undefined) return { agents: blockedGroup(members, "no transport resolved") };
  const shared = resolveSharedMcpTarget({ members, transport });
  if (shared._tag === "conflict") return { agents: blockedGroup(members, shared.reason) };
  const projected = members.map((member) => ({
    member,
    resolution: resolve(member, shared.config),
  }));
  const blockedBy = projected.find(({ resolution }) => !isRunnable(resolution));
  if (blockedBy !== undefined && !isRunnable(blockedBy.resolution)) {
    return {
      agents: blockedGroup(
        members,
        unreadableShared(blockedBy.member.agentId, path, blockedBy.resolution.reason),
      ),
    };
  }
  const entry = projected.flatMap(({ resolution }) =>
    isRunnable(resolution) ? [resolution.entry] : [],
  )[0];
  if (entry === undefined) return { agents: blockedGroup(members, "no entry resolved") };
  return {
    agents: projected.map(({ member, resolution }) =>
      resolution._tag === "needs-input"
        ? {
            _tag: "needs-input",
            agentId: member.agentId,
            config: shared.config,
            target: member.target,
            entry,
            warnings: resolution.warnings,
            missing: resolution.missing,
          }
        : {
            _tag: "projected",
            agentId: member.agentId,
            config: shared.config,
            target: member.target,
            entry,
            warnings: resolution._tag === "resolved" ? resolution.warnings : [],
            shimmed: resolution._tag === "resolved" ? resolution.shimmed : false,
          },
    ),
    write: {
      path: shared.path,
      config: shared.config,
      target: shared.target,
      entry,
      agentIds: members.map((member) => member.agentId),
    },
  };
};

/** Plan the native entry every configured agent should hold for one connection. */
export const planMcpServerTargets = (args: PlanMcpServerTargetsArgs): McpTargetPlan => {
  const inline = args.declaration.command !== undefined || args.declaration.url !== undefined;
  const transport = inline ? inlineTransport(args.declaration) : undefined;
  if (transport?._tag === "invalid") return transport;
  if (!inline && args.manifest === undefined) {
    return { _tag: "invalid", detail: "MCP server has no inline command or URL" };
  }
  const byAgent = new Map<string, McpAgentTargetPlan>();
  const writes: Array<McpTargetWrite> = [];
  for (const group of groupConfiguredMcpTargets({ agentIds: args.agentIds, scope: args.scope })) {
    const planned =
      transport?._tag === "transport"
        ? planInlineGroup(args, group.members, transport.transport)
        : args.manifest === undefined
          ? { agents: blockedGroup(group.members, "no manifest") }
          : planManifestGroup(args, args.manifest, group.members);
    for (const agent of planned.agents) byAgent.set(agent.agentId, agent);
    if (planned.write !== undefined) writes.push(planned.write);
  }
  const agents = args.agentIds.map((agentId): McpAgentTargetPlan => {
    const planned = byAgent.get(agentId);
    if (planned !== undefined) return planned;
    if (!isCapabilityAgentId(agentId)) {
      return {
        _tag: "unsupported",
        agentId,
        reason: `${agentId} has no MCP capability catalog entry`,
      };
    }
    if (configuredMcpCapability(agentId) === undefined) {
      return {
        _tag: "unsupported",
        agentId,
        reason: `${agentId} does not have MCP config support`,
      };
    }
    return {
      _tag: "unsupported",
      agentId,
      reason: `${agentId} has no ${args.scope} MCP config target`,
    };
  });
  return { _tag: "planned", agents, writes };
};
