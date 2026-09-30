import type { ResolvedMcpConfig } from "./shared-target.js";
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
  type McpConfigTarget,
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
import {
  configuredMcpCapability,
  readableMcpCapability,
  groupConfiguredMcpTargets,
  declaredMcpWriterTargets,
  isConfigurableAgentId,
  type McpTargetGroup,
} from "./targeting.js";
import * as Equal from "effect/Equal";

export interface PlanMcpServerTargetsArgs {
  readonly groups?: ReadonlyArray<McpTargetGroup>;
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
  readonly config: ResolvedMcpConfig;
  readonly target: McpConfigTarget;
}

export type McpAgentTargetPlan =
  | {
      readonly _tag: "unsupported" | "unverified";
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
  readonly config: ResolvedMcpConfig;
  readonly target: McpConfigTarget;
  readonly entry: Readonly<Record<string, unknown>>;
  readonly agentIds: ReadonlyArray<string>;
  readonly declaredTargets: ReadonlyArray<McpConfigTarget>;
}

export type McpTargetPlan =
  | { readonly _tag: "invalid"; readonly detail: string; readonly cause?: unknown }
  | {
      readonly _tag: "planned";
      /** Every native target, grouped in requested-agent order, including unresolved destinations. */
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
      envExpansion: readableMcpCapability(member.agentId)?.native.mcpEnvExpansion,
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
  if (
    projected.some(
      ({ result }) => result._tag === "projected" && !Equal.equals(result.entry, first.entry),
    )
  ) {
    return {
      agents: blockedGroup(
        members,
        `MCP target '${shared.path}' renders different content for its consumers`,
      ),
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
      agentIds: [
        ...new Set(members.filter((member) => member.configured).map((member) => member.agentId)),
      ],
      declaredTargets: members.map((member) => member.declaredTarget ?? member.target),
    },
  };
};

const planManifestGroup = (
  args: PlanMcpServerTargetsArgs,
  manifest: McpServerManifest,
  members: ReadonlyArray<SharedMcpTargetMember>,
): { readonly agents: ReadonlyArray<McpAgentTargetPlan>; readonly write?: McpTargetWrite } => {
  const path = members[0]?.target.path ?? "unknown";
  const resolve = (member: SharedMcpTargetMember, config: ResolvedMcpConfig): McpResolution => {
    const capability = readableMcpCapability(member.agentId);
    if (capability === undefined) {
      return { _tag: "no-distribution", reason: "agent does not have MCP config support" };
    }
    return resolveMcpServer({
      manifest,
      localName: args.serverName,
      capability: { ...capability, native: { ...capability.native, entryDialect: config } },
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
  if (
    projected.some(
      ({ resolution }) => isRunnable(resolution) && !Equal.equals(resolution.entry, entry),
    )
  ) {
    return {
      agents: blockedGroup(
        members,
        `MCP target '${shared.path}' renders different content for its consumers`,
      ),
    };
  }
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
      agentIds: [
        ...new Set(members.filter((member) => member.configured).map((member) => member.agentId)),
      ],
      declaredTargets: members.map((member) => member.declaredTarget ?? member.target),
    },
  };
};

/** Native support is independent of whether AXM can resolve and write its destinations. */
export const unresolvedMcpAgentTargets = (
  agentId: string,
  scope: "project" | "user",
  groups: ReadonlyArray<McpTargetGroup>,
): ReadonlyArray<Extract<McpAgentTargetPlan, { readonly _tag: "unsupported" | "unverified" }>> => {
  if (!isConfigurableAgentId(agentId))
    return [
      { _tag: "unsupported", agentId, reason: `${agentId} has no MCP capability catalog entry` },
    ];
  const native = CONFIGURABLE_AGENTS_BY_ID[agentId].capabilities["mcp-server"].native;
  if (!("scopes" in native))
    return [{ _tag: "unsupported", agentId, reason: `${agentId} has no native MCP support` }];
  if (!native.scopes.some((knownScope) => knownScope === scope))
    return [
      { _tag: "unsupported", agentId, reason: `${agentId} does not support MCP in ${scope} scope` },
    ];
  const capability = configuredMcpCapability(agentId);
  if (capability === undefined)
    return [
      {
        _tag: "unverified",
        agentId,
        reason: `${agentId} supports native MCP, but AXM has no verified writer`,
      },
    ];
  const destinations = declaredMcpWriterTargets(capability).filter(
    ({ location }) => location.scope === scope,
  );
  if (destinations.length === 0)
    return [
      {
        _tag: "unverified",
        agentId,
        reason: `${agentId} supports native MCP in ${scope} scope, but no writable native location is verified`,
      },
    ];
  const resolved = new Set(
    groups.flatMap((group) =>
      group.members
        .filter((member) => member.agentId === agentId)
        .map((member) => member.locationId),
    ),
  );
  return destinations
    .filter(({ location }) => !resolved.has(location.id))
    .map(({ location }) => ({
      _tag: "unverified",
      agentId,
      reason: `${agentId} native MCP location '${location.id}' is unresolved for ${scope} scope`,
    }));
};

/** Plan the native entry every configured agent should hold for one connection. */
export const planMcpServerTargets = (args: PlanMcpServerTargetsArgs): McpTargetPlan => {
  const inline = args.declaration.command !== undefined || args.declaration.url !== undefined;
  const transport = inline ? inlineTransport(args.declaration) : undefined;
  if (transport?._tag === "invalid") return transport;
  if (!inline && args.manifest === undefined) {
    return { _tag: "invalid", detail: "MCP server has no inline command or URL" };
  }
  const byAgent = new Map<string, Array<McpAgentTargetPlan>>();
  const groups =
    args.groups ?? groupConfiguredMcpTargets({ agentIds: args.agentIds, scope: args.scope });
  const writes: Array<McpTargetWrite> = [];
  for (const group of groups) {
    const consumers = group.members.filter((member) => member.configured);
    const planned =
      group.unverifiedReaders.length > 0
        ? { agents: blockedGroup(consumers, group.unverifiedReaders.join("; ")) }
        : transport?._tag === "transport"
          ? planInlineGroup(args, consumers, transport.transport)
          : args.manifest === undefined
            ? { agents: blockedGroup(consumers, "no manifest") }
            : planManifestGroup(args, args.manifest, consumers);
    for (const agent of planned.agents.filter((agent) => args.agentIds.includes(agent.agentId)))
      byAgent.set(agent.agentId, [...(byAgent.get(agent.agentId) ?? []), agent]);
    if (planned.write !== undefined)
      writes.push({
        ...planned.write,
        declaredTargets: group.members.map((member) => member.declaredTarget ?? member.target),
      });
  }
  const agents = args.agentIds.flatMap((agentId): ReadonlyArray<McpAgentTargetPlan> => [
    ...(byAgent.get(agentId) ?? []),
    ...unresolvedMcpAgentTargets(agentId, args.scope, groups),
  ]);
  return { _tag: "planned", agents, writes };
};
