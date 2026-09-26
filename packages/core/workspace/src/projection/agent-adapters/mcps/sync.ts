/**
 * Writing MCP connections into agent-native configuration, and withdrawing
 * them: the writer side of the target plan.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import type { McpConfigTarget } from "@agentxm/extension-model/unstable/agent-capabilities";
import { McpDefinitionInvalid, McpSharedTargetConflict } from "../errors.js";
import type { CodingAgentFailure } from "../errors.js";
import {
  MCP_SERVER_MANIFEST_FILENAME,
  type McpServerManifest,
} from "@agentxm/extension-model/unstable/mcps/manifest-schema";
import type { NativeWriteAuthority } from "../native-write-authority.js";
import { removeAgentMcpConfig, writeAgentMcpConfig } from "./config-writer.js";
import {
  managedNativeMcpEntryNames,
  readNativeMcpConfig,
  resolveAgentMcpConfigTargetPath,
} from "./native-config.js";
import {
  planMcpServerTargets,
  type McpAgentTargetPlan,
  type McpTargetPlan,
  type McpTargetWrite,
} from "./target-plan.js";
import { configuredMcpCapability } from "./targeting.js";
import type {
  AddMcpServerArgs,
  McpServerSyncOutcome,
  McpServerSyncTarget,
  RemoveMcpServerArgs,
} from "../agents/coding-agent.js";
import type { McpServerDeclaration } from "./expected-entry.js";
import { decodeMcpServerManifestAt } from "./manifest.js";

export interface SyncInlineMcpServerArgs {
  readonly workspaceRoot: string;
  readonly serverName: string;
  readonly entry: McpServerDeclaration;
  readonly scope?: "project" | "user";
}

export interface PruneManagedMcpServersArgs {
  readonly workspaceRoot: string;
  readonly declaredServerNames: ReadonlySet<string>;
  readonly scope?: "project" | "user";
  /** Inspect and report stale targets without changing agent configuration. */
  readonly dryRun?: boolean;
}

export interface SyncManifestMcpServerArgs extends AddMcpServerArgs {
  readonly agentIds: ReadonlyArray<string>;
}

export interface ValidateManifestMcpServerTargetsArgs {
  readonly manifest: McpServerManifest;
  readonly agentIds: ReadonlyArray<string>;
  readonly scope: "project" | "user";
  readonly serverName: string;
  readonly values: Readonly<Record<string, string>>;
  readonly enabled: boolean;
}

/** A plan whose readers all accept their shared entries, or the conflict that stops it. */
const plannedTargets = (
  plan: McpTargetPlan,
): Effect.Effect<
  Extract<McpTargetPlan, { readonly _tag: "planned" }>,
  McpDefinitionInvalid | McpSharedTargetConflict
> => {
  if (plan._tag === "invalid") {
    return Effect.fail(new McpDefinitionInvalid({ detail: plan.detail, cause: plan.cause }));
  }
  const blocked = plan.agents.find((agent) => agent._tag === "blocked");
  return blocked !== undefined && blocked._tag === "blocked"
    ? Effect.fail(new McpSharedTargetConflict({ reason: blocked.reason }))
    : Effect.succeed(plan);
};

/** Write every planned shared file once and report the targets each agent gained. */
const applyPlannedWrites = (
  workspaceRoot: string,
  serverName: string,
  writes: ReadonlyArray<McpTargetWrite>,
): Effect.Effect<
  ReadonlyMap<string, ReadonlyArray<McpServerSyncTarget>>,
  CodingAgentFailure,
  FileSystem.FileSystem | Path.Path | NativeWriteAuthority
> =>
  Effect.gen(function* () {
    const targetsByAgent = new Map<string, Array<McpServerSyncTarget>>();
    for (const write of writes) {
      const result = yield* writeAgentMcpConfig({
        workspaceRoot,
        serverName,
        serversKey: write.config.serversKey,
        target: write.target,
        entry: write.entry,
      });
      for (const agentId of write.agentIds) {
        const targets = targetsByAgent.get(agentId) ?? [];
        targets.push(...result.targets);
        targetsByAgent.set(agentId, targets);
      }
    }
    return targetsByAgent;
  });

const outcomeForAgent = (
  agent: McpAgentTargetPlan,
  targets: ReadonlyArray<McpServerSyncTarget>,
): McpServerSyncOutcome => {
  switch (agent._tag) {
    case "unsupported":
      return { _tag: "unsupported", reason: agent.reason };
    case "nothing-runnable":
      return { _tag: "nothing-runnable", reason: agent.reason };
    case "blocked":
      return { _tag: "unsupported", reason: agent.reason };
    case "needs-input":
      return { _tag: "needs-input", reason: agent.warnings.join("; ") };
    case "projected":
      return agent.shimmed
        ? {
            _tag: "fallback",
            reason: agent.warnings.join("; "),
            targets,
          }
        : {
            _tag: "success",
            targets,
            ...(agent.warnings.length > 0 ? { warnings: agent.warnings } : {}),
          };
  }
};

/** Project one inline server into every configured agent that shares its files. */
export const syncInlineMcpServerToAgents = (
  agentIds: ReadonlyArray<string>,
  args: SyncInlineMcpServerArgs,
): Effect.Effect<
  ReadonlyArray<McpServerSyncOutcome>,
  CodingAgentFailure,
  FileSystem.FileSystem | Path.Path | NativeWriteAuthority
> =>
  Effect.gen(function* () {
    const plan = yield* plannedTargets(
      planMcpServerTargets({
        agentIds,
        scope: args.scope ?? "project",
        serverName: args.serverName,
        declaration: args.entry,
        values: args.entry.env,
        enabled: args.entry.enabled ?? true,
      }),
    );
    const written = yield* applyPlannedWrites(args.workspaceRoot, args.serverName, plan.writes);
    return plan.agents.map((agent) => outcomeForAgent(agent, written.get(agent.agentId) ?? []));
  });

/** Remove every AXM-managed entry desired state no longer names from one agent's files. */
export const pruneManagedMcpServersForAgent = (
  agentId: string,
  args: PruneManagedMcpServersArgs,
): Effect.Effect<
  McpServerSyncOutcome,
  CodingAgentFailure,
  FileSystem.FileSystem | Path.Path | NativeWriteAuthority
> =>
  Effect.gen(function* () {
    const capability = configuredMcpCapability(agentId);
    if (capability === undefined) {
      return {
        _tag: "unsupported",
        reason: `${agentId} does not have MCP config support`,
      } as const;
    }
    const config = capability.axm.writer.config;
    const targets = config.targets.filter((target) => target.scope === (args.scope ?? "project"));
    const prunedTargets: Array<McpServerSyncTarget> = [];
    yield* Effect.forEach(
      targets,
      (target) =>
        Effect.gen(function* () {
          const configPath = yield* resolveAgentMcpConfigTargetPath(args.workspaceRoot, target);
          const raw = yield* readNativeMcpConfig(configPath);
          if (Option.isNone(raw)) return;
          const managed = yield* managedNativeMcpEntryNames({
            format: target.format,
            configPath,
            raw: raw.value,
            serversKey: config.serversKey,
          });
          const staleNames = managed.filter((name) => !args.declaredServerNames.has(name));
          if (staleNames.length === 0) return;
          if (args.dryRun !== true) {
            yield* Effect.forEach(
              staleNames,
              (serverName) =>
                removeAgentMcpConfig({
                  workspaceRoot: args.workspaceRoot,
                  serverName,
                  serversKey: config.serversKey,
                  target,
                  activationField: config.activationField,
                  disableOnly: false,
                }),
              { concurrency: 1 },
            );
          }
          prunedTargets.push({ path: configPath, change: "updated" });
        }),
      { concurrency: 1 },
    );
    return {
      _tag: "success",
      ...(prunedTargets.length > 0 ? { targets: prunedTargets } : {}),
    } satisfies McpServerSyncOutcome;
  });

const manifestDeclaration = (args: {
  readonly configValues?: Readonly<Record<string, string>> | undefined;
  readonly enabled?: boolean | undefined;
}): McpServerDeclaration => ({
  kind: "configuration",
  env: args.configValues ?? {},
  ...(args.enabled === undefined ? {} : { enabled: args.enabled }),
});

/** Refuse a manifest whose shared targets cannot hold one entry every reader accepts. */
export const validateManifestMcpServerTargets = (
  args: ValidateManifestMcpServerTargetsArgs,
): Effect.Effect<void, McpDefinitionInvalid | McpSharedTargetConflict> =>
  plannedTargets(
    planMcpServerTargets({
      agentIds: args.agentIds,
      scope: args.scope,
      serverName: args.serverName,
      declaration: { kind: "configuration", env: args.values, enabled: args.enabled },
      manifest: args.manifest,
      values: args.values,
      enabled: args.enabled,
    }),
  ).pipe(Effect.asVoid);

/** Project one manifest-backed server while treating each shared file as one decision. */
export const syncManifestMcpServerToAgents = (
  args: SyncManifestMcpServerArgs,
): Effect.Effect<
  ReadonlyArray<McpServerSyncOutcome>,
  CodingAgentFailure,
  FileSystem.FileSystem | Path.Path | NativeWriteAuthority
> =>
  Effect.gen(function* () {
    if (args.agentIds.length === 0) return [];
    const path = yield* Path.Path;
    const manifest = yield* decodeMcpServerManifestAt(
      path.join(args.canonicalPath, MCP_SERVER_MANIFEST_FILENAME),
    );
    const plan = yield* plannedTargets(
      planMcpServerTargets({
        agentIds: args.agentIds,
        scope: args.scope ?? "project",
        serverName: args.serverName,
        declaration: manifestDeclaration(args),
        manifest,
        values: args.configValues ?? {},
        enabled: args.enabled ?? true,
      }),
    );
    const written = yield* applyPlannedWrites(args.workspaceRoot, args.serverName, plan.writes);
    return plan.agents.map((agent): McpServerSyncOutcome => {
      const outcome = outcomeForAgent(agent, written.get(agent.agentId) ?? []);
      // A shim is a resolution detail here, not a fallback: the connection
      // reached the agent through the representation it accepts.
      return outcome._tag === "fallback"
        ? {
            _tag: "success",
            ...(outcome.targets === undefined ? {} : { targets: outcome.targets }),
            ...(outcome.reason.length > 0 ? { warnings: [outcome.reason] } : {}),
          }
        : outcome;
    });
  });

const targetsInScope = (
  agentId: string,
  scope: "project" | "user",
): ReadonlyArray<McpConfigTarget> =>
  configuredMcpCapability(agentId)?.axm.writer.config.targets.filter(
    (target) => target.scope === scope,
  ) ?? [];

export const removeMcpServerFromManifest = (
  agentId: string,
  args: RemoveMcpServerArgs,
): Effect.Effect<
  McpServerSyncOutcome,
  CodingAgentFailure,
  FileSystem.FileSystem | Path.Path | NativeWriteAuthority
> =>
  Effect.gen(function* () {
    const capability = configuredMcpCapability(agentId);
    if (capability === undefined) {
      return {
        _tag: "unsupported",
        reason: `${agentId} does not have MCP config support`,
      } as const;
    }
    const config = capability.axm.writer.config;
    const writeResults = yield* Effect.forEach(
      targetsInScope(agentId, args.scope ?? "project"),
      (target) =>
        removeAgentMcpConfig({
          workspaceRoot: args.workspaceRoot,
          serverName: args.serverName,
          serversKey: config.serversKey,
          target,
          activationField: config.activationField,
          disableOnly: args.disableOnly ?? false,
        }),
      // eslint-disable-next-line axm-policy/no-unbounded-io -- catalog-declared MCP config targets for one agent
      { concurrency: "unbounded" },
    );
    const syncTargets = writeResults.flatMap((result) => result.targets);
    return { _tag: "success", targets: syncTargets } as const;
  });
