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
import { projectExpectedEntry, type McpServerDeclaration } from "./expected-entry.js";
import { resolveMcpInvocation } from "./resolution.js";
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
  readonly resolvedCwd?: string | undefined;
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
      resolvedCwd: args.resolvedCwd,
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
export const planMcpServerTargets = (input: PlanMcpServerTargetsArgs): McpTargetPlan => {
  const resolution =
    input.declaration.connection !== undefined
      ? undefined
      : input.manifest === undefined
        ? undefined
        : resolveMcpInvocation({
            manifest: input.manifest,
            distribution: input.declaration.distribution,
            bindings: input.declaration.bindings,
            auth: input.declaration.auth,
          });
  const connection =
    input.declaration.connection ??
    (resolution?._tag === "resolved" ? resolution.connection : undefined);
  if (connection === undefined)
    return {
      _tag: "invalid",
      detail:
        resolution?._tag === "blocked"
          ? resolution.reason
          : "MCP connection has no invocation or accepted manifest",
    };
  const args = {
    ...input,
    declaration: {
      ...input.declaration,
      connection,
      ...(input.manifest === undefined
        ? {}
        : { source: `${input.manifest.owner}/mcps/${input.manifest.name}` }),
    },
  };
  const transport = connection.transport;
  const byAgent = new Map<string, Array<McpAgentTargetPlan>>();
  const groups =
    args.groups ?? groupConfiguredMcpTargets({ agentIds: args.agentIds, scope: args.scope });
  const writes: Array<McpTargetWrite> = [];
  for (const group of groups) {
    const consumers = group.members.filter((member) => member.configured);
    const competing =
      group.competingEntries?.filter(
        (entry) => entry.name === args.serverName || entry.name === "*",
      ) ?? [];
    const blockers = [
      ...group.unverifiedReaders,
      ...competing.filter((entry) => entry.blocks).map((entry) => entry.reason),
    ];
    const planned =
      blockers.length > 0
        ? { agents: blockedGroup(consumers, blockers.join("; ")) }
        : planInlineGroup(args, consumers, transport);
    for (const agent of planned.agents.filter((agent) => args.agentIds.includes(agent.agentId)))
      byAgent.set(agent.agentId, [
        ...(byAgent.get(agent.agentId) ?? []),
        agent._tag === "projected"
          ? {
              ...agent,
              warnings: [
                ...(resolution?._tag === "resolved" ? resolution.warnings : []),
                ...agent.warnings,
                ...competing.map((entry) => entry.reason),
              ],
            }
          : agent,
      ]);
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
