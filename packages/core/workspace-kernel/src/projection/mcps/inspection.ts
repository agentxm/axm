/**
 * MCP projection facts: what each configured agent's native configuration
 * holds for one desired connection, judged against the entry the target plan
 * says it should hold, and what each answer means for the workspace.
 *
 * This is the one judge of MCP projection currency. Sync, `mcps list`,
 * `mcps show`, and activation all consume it from the desired-state graph;
 * none of them decides currency from a raw settings entry.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { McpConfigTarget } from "@agentxm/extension-model/unstable/agent-capabilities";
import { MCP_SERVER_MANIFEST_FILENAME } from "@agentxm/extension-model/unstable/mcps/manifest-schema";
import type { McpInspectionError } from "./errors.js";
import type { ConfiguredAgentOutcome } from "../../operations/index.js";
import type { McpServerEntry } from "../../workspace-state/index.js";
import {
  decodeMcpServerManifestAt,
  readPluginMcpDefinition,
  resolveConfiguredMcpTargets,
  hasTomlMcpEntry,
  isAxmManagedMcpEntry,
  managedNativeMcpEntryNames,
  matchesAcceptedMcpOwnership,
  readNativeMcpValues,
  type AxmMcpMetadata,
  McpDefinitionInvalid,
  McpOwnershipMarkerInvalid,
  parseTomlMcpEntry,
  planMcpServerTargets,
  unresolvedMcpAgentTargets,
  readNativeMcpConfig,
  readNativeMcpEntry,
  reconcileKeyedBlock,
  resolveAgentMcpConfigTargetPath,
  type ExpectedAgentEntry,
  type McpAgentTargetPlan,
  type McpServerDeclaration,
} from "../../agent-adapters/index.js";
import {
  combineNativeLocationOutcomes,
  type NativeDirectoryInputs,
  type NativeLocationOutcome,
} from "../../locations/index.js";
import { diffAgentEntry } from "./drift.js";

export type AgentMcpInspectionStatus =
  "unsupported" | "unverified" | "blocked" | "absent" | "match" | "drift" | "unmanaged";

export interface AgentMcpServerInspection {
  readonly agentId: string;
  readonly path: string;
  readonly absolutePath: string;
  readonly status: AgentMcpInspectionStatus;
  readonly fields: ReadonlyArray<string>;
  readonly warnings: ReadonlyArray<string>;
  readonly reason?: string;
  readonly expected?: Readonly<Record<string, unknown>>;
  readonly actual?: Readonly<Record<string, unknown>>;
}

/** The desired-state facts an inspection reads for one MCP connection. */
export interface DesiredMcpServerSubject {
  readonly name: string;
  /** Absent means sourced: the graph marks only inline nodes. */
  readonly authority?: "inline" | "sourced" | undefined;
}

export interface InspectDesiredMcpServerArgs {
  readonly workspaceRoot: string;
  readonly nativeDirectoryInputs: NativeDirectoryInputs;
  readonly scope: "project" | "user";
  readonly agentIds: ReadonlyArray<string>;
  readonly node: DesiredMcpServerSubject;
  /**
   * The settings entry under the node's name: the inline transport, or the
   * preferences a sourced or Pack-supplied connection is configured with. Absent for
   * a Pack member the workspace has not configured.
   */
  readonly entry: McpServerEntry | undefined;
  /** Canonical roots a sourced connection's manifest may live under. */
  readonly canonicalPaths: ReadonlyArray<string>;
  /** `projected` reports the expected entries without reading disk; `current` reads them back. */
  readonly state?: "projected" | "current";
}

export interface DesiredMcpServerInspection {
  readonly inspections: ReadonlyArray<AgentMcpServerInspection>;
  readonly nativeLocations: ReadonlyArray<NativeLocationOutcome>;
  /** The inspections restated in the workspace's per-agent outcome vocabulary. */
  readonly outcomes: ReadonlyArray<ConfiguredAgentOutcome>;
  /** Every configured agent either holds the expected entry or cannot represent it. */
  readonly current: boolean;
  /**
   * The shared-target conflict that blocks a group of readers, when one does:
   * the connection has no native shape every reader of that file accepts, so
   * no write can make it current. Callers that plan writes refuse on it.
   */
  readonly conflict: Option.Option<string>;
}

export interface ManagedAgentMcpServer {
  readonly ownership: "owned" | "unowned";
  readonly agentId: string;
  readonly serverName: string;
  readonly keyPath: readonly [string, ...string[]];
  readonly path: string;
  readonly absolutePath: string;
  readonly target: McpConfigTarget;
}

export interface CollectManagedAgentMcpServersArgs {
  readonly expectedOwnershipByName: Readonly<Record<string, ReadonlyArray<AxmMcpMetadata>>>;
  readonly workspaceRoot: string;
  readonly nativeDirectoryInputs: NativeDirectoryInputs;
  readonly scope: "project" | "user";
  readonly agentIds: ReadonlyArray<string>;
}

type McpInspectionExpectation = ExpectedAgentEntry | { readonly _tag: "managed" };

/** What an inspection status means as a configured-agent outcome. */
export const mcpInspectionOutcome = (args: {
  readonly name: string;
  readonly inspection: AgentMcpServerInspection;
  readonly state: "projected" | "current";
}): ConfiguredAgentOutcome => {
  const { inspection } = args;
  return {
    extensionType: "mcp-server",
    name: args.name,
    agentId: inspection.agentId,
    outcome:
      inspection.status === "match"
        ? args.state
        : inspection.status === "unsupported"
          ? "unsupported"
          : inspection.status === "blocked" || inspection.status === "unverified"
            ? "blocked"
            : "failed",
    reasonCode:
      inspection.status === "match"
        ? "supported"
        : inspection.status === "absent"
          ? "projection-missing"
          : inspection.status === "drift"
            ? "stale-projection"
            : `mcp-${inspection.status}`,
    reason:
      inspection.reason ??
      (inspection.status === "match"
        ? `${inspection.agentId} has a matching MCP projection.`
        : inspection.status === "absent"
          ? `The expected ${inspection.agentId} projection is missing.`
          : inspection.status === "drift"
            ? `The expected ${inspection.agentId} projection is stale${
                inspection.fields.length === 0 ? "" : ` (${inspection.fields.join(", ")})`
              }.`
            : inspection.status === "unmanaged"
              ? `${inspection.agentId} holds an entry AXM does not own under this name.`
              : `MCP projection status is ${inspection.status}.`),
    ...(inspection.path.length === 0 ? {} : { path: inspection.path }),
  };
};

/** A connection is current when every agent matches or cannot represent it. */
export const mcpInspectionsCurrent = (
  inspections: ReadonlyArray<AgentMcpServerInspection>,
): boolean =>
  inspections.every(
    (inspection) => inspection.status === "match" || inspection.status === "unsupported",
  );

const inspectActual = (args: {
  readonly target: McpConfigTarget;
  readonly configPath: string;
  readonly serversPath: ReadonlyArray<string>;
  readonly serverName: string;
  readonly expected: McpInspectionExpectation;
}): Effect.Effect<
  {
    readonly status: Exclude<AgentMcpInspectionStatus, "unsupported" | "unverified" | "blocked">;
    readonly fields: ReadonlyArray<string>;
    readonly actual?: Readonly<Record<string, unknown>>;
  },
  McpInspectionError,
  FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    const raw = yield* readNativeMcpConfig(args.configPath);
    if (Option.isNone(raw)) return { status: "absent", fields: [] };

    if (args.target.format === "toml") {
      const actualBlock = reconcileKeyedBlock({
        content: raw.value,
        region: `mcp-server:${args.serverName}`,
        owner: "",
        rendered: "",
      });
      if (
        actualBlock.state.state === "malformed" ||
        actualBlock.state.state === "unsupported-version"
      ) {
        return yield* new McpOwnershipMarkerInvalid({
          serverName: args.serverName,
          state: actualBlock.state.state,
          operation: "inspect",
        });
      }
      if (actualBlock.body === undefined) {
        if (!hasTomlMcpEntry(raw.value, args.serversPath, args.serverName)) {
          return { status: "absent", fields: [] };
        }
        const unfenced = parseTomlMcpEntry(raw.value, args.serversPath, args.serverName);
        return isAxmManagedMcpEntry(unfenced)
          ? { status: "drift", fields: ["ownership-marker"], actual: unfenced }
          : { status: "unmanaged", fields: [], actual: unfenced };
      }
      const actual = parseTomlMcpEntry(actualBlock.body, args.serversPath, args.serverName);
      if (args.expected._tag === "managed") {
        return isAxmManagedMcpEntry(actual)
          ? { status: "match", fields: [], actual }
          : { status: "drift", fields: ["x-axm"], actual };
      }
      const drift = diffAgentEntry(args.expected, actual);
      if (drift._tag === "match") return { status: "match", fields: [], actual };
      if (drift._tag === "unmanaged") return { status: "unmanaged", fields: [], actual };
      if (drift._tag === "drift") return { status: "drift", fields: drift.fields, actual };
      return { status: "absent", fields: [] };
    }

    const actual = yield* readNativeMcpEntry({
      format: args.target.format,
      configPath: args.configPath,
      raw: raw.value,
      serversPath: args.serversPath,
      serverName: args.serverName,
    });
    if (Option.isNone(actual)) return { status: "absent", fields: [] };
    if (!isAxmManagedMcpEntry(actual.value)) {
      return { status: "unmanaged", fields: [], actual: actual.value };
    }
    if (args.expected._tag === "managed") {
      return { status: "match", fields: [], actual: actual.value };
    }
    const drift = diffAgentEntry(args.expected, actual.value);
    if (drift._tag === "match") return { status: "match", fields: [], actual: actual.value };
    if (drift._tag === "drift") {
      return { status: "drift", fields: drift.fields, actual: actual.value };
    }
    return { status: "absent", fields: [] };
  });

const terminalInspection = (args: {
  readonly agentId: string;
  readonly status: "unsupported" | "unverified" | "blocked";
  readonly reason: string;
  readonly target?: McpConfigTarget | undefined;
  readonly absolutePath?: string;
  readonly warnings?: ReadonlyArray<string>;
  readonly expected?: Readonly<Record<string, unknown>>;
}): AgentMcpServerInspection => ({
  agentId: args.agentId,
  path: args.target?.path ?? "",
  absolutePath: args.absolutePath ?? "",
  status: args.status,
  fields: [],
  warnings: args.warnings ?? [],
  reason: args.reason,
  ...(args.expected === undefined ? {} : { expected: args.expected }),
});

const absolutePathFor = (
  workspaceRoot: string,
  target: McpConfigTarget | undefined,
): Effect.Effect<string, McpInspectionError, FileSystem.FileSystem | Path.Path> =>
  target === undefined
    ? Effect.succeed("")
    : resolveAgentMcpConfigTargetPath(workspaceRoot, target);

const inspectPlannedAgent = (
  args: InspectDesiredMcpServerArgs,
  agent: McpAgentTargetPlan,
): Effect.Effect<AgentMcpServerInspection, McpInspectionError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const absolutePath = yield* absolutePathFor(args.workspaceRoot, agent.target);
    switch (agent._tag) {
      case "unsupported":
      case "nothing-runnable":
        return terminalInspection({
          agentId: agent.agentId,
          status: "unsupported",
          reason: agent.reason,
          target: agent.target,
          absolutePath,
        });
      case "unverified":
      case "blocked":
        return terminalInspection({
          agentId: agent.agentId,
          status: agent._tag,
          reason: agent.reason,
          target: agent.target,
          absolutePath,
        });
      case "needs-input":
        return terminalInspection({
          agentId: agent.agentId,
          status: "blocked",
          reason: agent.warnings.join("; "),
          target: agent.target,
          absolutePath,
          warnings: agent.warnings,
          expected: agent.entry,
        });
      case "projected": {
        if (args.state === "projected") {
          return {
            agentId: agent.agentId,
            path: agent.target.path,
            absolutePath,
            status: "match",
            fields: [],
            warnings: agent.warnings,
            expected: agent.entry,
          };
        }
        const actual = yield* inspectActual({
          target: agent.target,
          configPath: absolutePath,
          serversPath: agent.config.serversPath,
          serverName: args.node.name,
          expected: { _tag: "projected", entry: agent.entry, warnings: agent.warnings },
        });
        return {
          agentId: agent.agentId,
          path: agent.target.path,
          absolutePath,
          status: actual.status,
          fields: actual.fields,
          warnings: agent.warnings,
          expected: agent.entry,
          ...(actual.actual === undefined ? {} : { actual: actual.actual }),
        };
      }
    }
  });

/**
 * Presence-only inspection for a sourced connection whose manifest is not
 * available: the expected entry cannot be rendered, so an AXM-managed entry
 * under the name is all that can be checked.
 */
const inspectManagedPresence = (
  args: InspectDesiredMcpServerArgs,
): Effect.Effect<
  ReadonlyArray<AgentMcpServerInspection>,
  McpInspectionError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const groups = yield* resolveConfiguredMcpTargets(args);
    const inspections: Array<AgentMcpServerInspection> = [];
    for (const agentId of args.agentIds) {
      for (const unresolved of unresolvedMcpAgentTargets(agentId, args.scope, groups)) {
        inspections.push(
          terminalInspection({ agentId, status: unresolved._tag, reason: unresolved.reason }),
        );
      }
      for (const member of groups.flatMap((group) =>
        group.members.filter((candidate) => candidate.agentId === agentId),
      )) {
        const { config, target } = member;
        const absolutePath = target.path;
        if (args.state === "projected") {
          inspections.push({
            agentId,
            path: target.path,
            absolutePath,
            status: "match",
            fields: [],
            warnings: [],
          });
          continue;
        }
        const actual = yield* inspectActual({
          target,
          configPath: absolutePath,
          serversPath: config.serversPath,
          serverName: args.node.name,
          expected: { _tag: "managed" },
        });
        inspections.push({
          agentId,
          path: target.path,
          absolutePath,
          status: actual.status,
          fields: actual.fields,
          warnings: [],
          ...(actual.actual === undefined ? {} : { actual: actual.actual }),
        });
      }
    }
    return inspections;
  });

const findManifestRoot = (
  workspaceRoot: string,
  canonicalPaths: ReadonlyArray<string>,
): Effect.Effect<Option.Option<string>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    for (const candidate of canonicalPaths) {
      const resolved = path.resolve(workspaceRoot, candidate);
      const manifestPath = path.join(resolved, MCP_SERVER_MANIFEST_FILENAME);
      if (yield* fs.exists(manifestPath).pipe(Effect.catch(() => Effect.succeed(false)))) {
        return Option.some(resolved);
      }
    }
    return Option.none();
  });

/** The declaration an inspection renders: the entry as it would be projected when enabled. */
const inspectedDeclaration = (
  node: DesiredMcpServerSubject,
  entry: McpServerEntry | undefined,
): McpServerDeclaration | undefined => {
  if (entry !== undefined) return { ...entry, enabled: true };
  return node.authority === "inline" ? undefined : { kind: "configuration", enabled: true };
};

/**
 * Inspect one desired MCP connection on every configured agent.
 *
 * The expected entries come from the target plan the writer also renders
 * from, so a currency judgment and a write never disagree about what an
 * agent should hold.
 */
export const inspectDesiredMcpServer = (
  args: InspectDesiredMcpServerArgs,
): Effect.Effect<
  DesiredMcpServerInspection,
  McpInspectionError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const state = args.state ?? "current";
    const declaration = inspectedDeclaration(args.node, args.entry);
    if (declaration === undefined) {
      return yield* new McpDefinitionInvalid({
        detail: `Inline MCP server ${args.node.name} has no settings entry to render`,
      });
    }
    const inline = declaration.connection !== undefined;
    const manifestRoot = inline
      ? Option.none<string>()
      : yield* findManifestRoot(args.workspaceRoot, args.canonicalPaths);
    const observed = yield* Effect.gen(function* () {
      if (!inline && Option.isNone(manifestRoot))
        return {
          inspections: yield* inspectManagedPresence(args),
          nativeLocations: [],
          conflict: Option.none<string>(),
        };
      const path = yield* Path.Path;
      const nativeComponent =
        args.entry?.kind === "sourced" ? args.entry.nativeComponent : undefined;
      const nativeDefinition =
        nativeComponent === undefined || Option.isNone(manifestRoot)
          ? undefined
          : yield* readPluginMcpDefinition(manifestRoot.value, nativeComponent);
      const manifest =
        Option.isNone(manifestRoot) || nativeComponent !== undefined
          ? undefined
          : yield* decodeMcpServerManifestAt(
              path.join(manifestRoot.value, MCP_SERVER_MANIFEST_FILENAME),
            );
      const groups = yield* resolveConfiguredMcpTargets(args);
      const plan = planMcpServerTargets({
        groups,
        agentIds: args.agentIds,
        scope: args.scope,
        serverName: args.node.name,
        declaration,
        manifest,
        ...(nativeDefinition === undefined ? {} : { nativeDefinition }),
        resolvedCwd:
          declaration.connection?.transport === "stdio" &&
          declaration.connection.cwd?.base === "scope"
            ? path.resolve(args.workspaceRoot, declaration.connection.cwd.path)
            : undefined,
        enabled: true,
      });
      if (plan._tag === "invalid") {
        return {
          inspections: args.agentIds.map((agentId) =>
            terminalInspection({ agentId, status: "blocked", reason: plan.detail }),
          ),
          nativeLocations: [],
          conflict: Option.some(plan.detail),
        };
      }
      const conflict = Option.fromUndefinedOr(
        plan.agents.flatMap((agent) => (agent._tag === "blocked" ? [agent.reason] : []))[0],
      );
      const inspections = yield* Effect.forEach(
        plan.agents,
        (agent) => inspectPlannedAgent(args, agent),
        {
          concurrency: 16,
        },
      );
      const nativeLocations = combineNativeLocationOutcomes(
        plan.writes.map((write): NativeLocationOutcome => {
          const members = inspections.filter(
            (inspection) => inspection.absolutePath === write.path,
          );
          const absent =
            members.length > 0 && members.every((inspection) => inspection.status === "absent");
          const current =
            members.length > 0 && members.every((inspection) => inspection.status === "match");
          const blocked = members.some(
            (inspection) => inspection.status === "unmanaged" || inspection.status === "blocked",
          );
          const owned =
            members.length > 0 &&
            members.every(
              (inspection) =>
                inspection.status === "match" ||
                (inspection.status === "drift" &&
                  inspection.actual !== undefined &&
                  isAxmManagedMcpEntry(inspection.actual)),
            );
          return {
            scope: args.scope,
            address: {
              kind: "key-path",
              path: write.path,
              keys: [...write.config.serversPath, args.node.name],
            },
            aliases: [
              ...new Set(
                write.declaredTargets.map((target) =>
                  path.resolve(
                    args.workspaceRoot,
                    target.scope === "user" && target.path.startsWith("~/")
                      ? target.path.slice(2)
                      : target.path,
                  ),
                ),
              ),
            ].sort(),
            configuredConsumers: [...new Set(write.agentIds)].sort(),
            potentialReaders: [
              ...new Set(
                groups
                  .filter((group) => group.path === write.path)
                  .flatMap((group) =>
                    group.members
                      .filter((member) => !member.configured)
                      .map((member) => member.agentId),
                  ),
              ),
            ].sort(),
            policyReasons: [],
            ownership: absent ? "absent" : owned ? "owned" : blocked ? "unowned" : "unverified",
            ...(owned ? { proof: "managed-mcp-entry" } : {}),
            state: blocked ? "blocked" : absent ? "created" : current ? "unchanged" : "updated",
            mechanism: "structured-entry",
            availability: write.agentIds.map((agentId) => ({
              agentId,
              state: "unverified",
              reason:
                "Planned native reconciliation has not been applied; agent configuration selection is not observed",
            })),
          };
        }),
      );
      return { inspections, nativeLocations, conflict };
    });
    return {
      ...observed,
      outcomes: observed.inspections.map((inspection) =>
        mcpInspectionOutcome({ name: args.node.name, inspection, state }),
      ),
      current: mcpInspectionsCurrent(observed.inspections),
    };
  });

/** Every marker-bearing native entry, classified against accepted ownership, by agent. */
export const collectManagedAgentMcpServers = (
  args: CollectManagedAgentMcpServersArgs,
): Effect.Effect<
  ReadonlyArray<ManagedAgentMcpServer>,
  McpInspectionError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const groups = yield* resolveConfiguredMcpTargets(args);
    const perGroup = yield* Effect.forEach(
      groups,
      (group) =>
        Effect.gen(function* () {
          const absolutePath = group.path;
          const raw = yield* readNativeMcpConfig(absolutePath);
          if (Option.isNone(raw)) return [];
          const containers = new Map<
            string,
            {
              readonly names: ReadonlyArray<string>;
              readonly values: Readonly<Record<string, unknown>>;
            }
          >();
          const results: Array<ManagedAgentMcpServer> = [];
          for (const member of group.members.filter((candidate) => candidate.configured)) {
            const key = JSON.stringify([member.target.format, member.config.serversPath]);
            let container = containers.get(key);
            if (container === undefined) {
              const read = {
                format: member.target.format,
                configPath: absolutePath,
                raw: raw.value,
                serversPath: member.config.serversPath,
              };
              container = {
                names: yield* managedNativeMcpEntryNames(read),
                values: yield* readNativeMcpValues(read),
              };
              containers.set(key, container);
            }
            for (const serverName of container.names) {
              if (
                results.some(
                  (result) =>
                    result.agentId === member.agentId &&
                    result.serverName === serverName &&
                    JSON.stringify(result.keyPath) ===
                      JSON.stringify([...member.config.serversPath, serverName]) &&
                    result.target.format === member.target.format &&
                    result.target.path === member.target.path,
                )
              )
                continue;
              results.push({
                ownership: matchesAcceptedMcpOwnership(
                  container.values[serverName],
                  args.expectedOwnershipByName[serverName] ?? [],
                )
                  ? "owned"
                  : "unowned",
                agentId: member.agentId,
                serverName,
                keyPath: [...member.config.serversPath, serverName],
                path: member.target.path,
                absolutePath,
                target: member.target,
              });
            }
          }
          return results;
        }),
      { concurrency: 16 },
    );
    return perGroup.flat();
  });
