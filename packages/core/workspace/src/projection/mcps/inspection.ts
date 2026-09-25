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
import type { ConfiguredAgentOutcome, McpServerEntry } from "../../desired-state/index.js";
import {
  collectSecretInputNames,
  configuredMcpCapability,
  decodeMcpServerManifestAt,
  groupConfiguredMcpTargets,
  hasTomlMcpEntry,
  isAxmManagedMcpEntry,
  managedNativeMcpEntryNames,
  McpDefinitionInvalid,
  McpOwnershipMarkerInvalid,
  mcpProjectionInputValues,
  parseTomlMcpEntry,
  planMcpServerTargets,
  readNativeMcpConfig,
  readNativeMcpEntry,
  reconcileKeyedBlock,
  resolveAgentMcpConfigTargetPath,
  type ExpectedAgentEntry,
  type McpAgentTargetPlan,
  type McpServerDeclaration,
} from "../agent-adapters/index.js";
import { diffAgentEntry } from "./drift.js";

export type AgentMcpInspectionStatus =
  "unsupported" | "blocked" | "absent" | "match" | "drift" | "unmanaged";

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
  readonly scope: "project" | "user";
  readonly agentIds: ReadonlyArray<string>;
  readonly node: DesiredMcpServerSubject;
  /**
   * The settings entry under the node's name: the inline transport, or the
   * env a sourced or Pack-supplied connection is configured with. Absent for
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
  readonly agentId: string;
  readonly serverName: string;
  readonly path: string;
  readonly absolutePath: string;
  readonly target: McpConfigTarget;
}

export interface CollectManagedAgentMcpServersArgs {
  readonly workspaceRoot: string;
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
          : inspection.status === "blocked"
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
  readonly serversKey: string;
  readonly serverName: string;
  readonly expected: McpInspectionExpectation;
}): Effect.Effect<
  {
    readonly status: Exclude<AgentMcpInspectionStatus, "unsupported" | "blocked">;
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
        if (!hasTomlMcpEntry(raw.value, args.serversKey, args.serverName)) {
          return { status: "absent", fields: [] };
        }
        const unfenced = parseTomlMcpEntry(raw.value, args.serversKey, args.serverName);
        return isAxmManagedMcpEntry(unfenced)
          ? { status: "drift", fields: ["ownership-marker"], actual: unfenced }
          : { status: "unmanaged", fields: [], actual: unfenced };
      }
      const actual = parseTomlMcpEntry(actualBlock.body, args.serversKey, args.serverName);
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
      serversKey: args.serversKey,
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
  readonly status: "unsupported" | "blocked";
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
): Effect.Effect<string, McpInspectionError, Path.Path> =>
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
      case "blocked":
        return terminalInspection({
          agentId: agent.agentId,
          status: "blocked",
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
          serversKey: agent.config.serversKey,
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
  Effect.forEach(
    args.agentIds,
    (agentId) =>
      Effect.gen(function* () {
        const capability = configuredMcpCapability(agentId);
        if (capability === undefined) {
          return terminalInspection({
            agentId,
            status: "unsupported",
            reason: `${agentId} does not have MCP config support`,
          });
        }
        const config = capability.axm.writer.config;
        const target = config.targets.find((item) => item.scope === args.scope);
        if (target === undefined) {
          return terminalInspection({
            agentId,
            status: "unsupported",
            reason: `${agentId} has no ${args.scope} MCP config target`,
          });
        }
        const absolutePath = yield* resolveAgentMcpConfigTargetPath(args.workspaceRoot, target);
        if (args.state === "projected") {
          return {
            agentId,
            path: target.path,
            absolutePath,
            status: "match" as const,
            fields: [],
            warnings: [],
          };
        }
        const actual = yield* inspectActual({
          target,
          configPath: absolutePath,
          serversKey: config.serversKey,
          serverName: args.node.name,
          expected: { _tag: "managed" },
        });
        return {
          agentId,
          path: target.path,
          absolutePath,
          status: actual.status,
          fields: actual.fields,
          warnings: [],
          ...(actual.actual === undefined ? {} : { actual: actual.actual }),
        };
      }),
    { concurrency: 16 },
  );

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
  return node.authority === "inline"
    ? undefined
    : { kind: "configuration", env: {}, enabled: true };
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
    const inline = declaration.command !== undefined || declaration.url !== undefined;
    const manifestRoot = inline
      ? Option.none<string>()
      : yield* findManifestRoot(args.workspaceRoot, args.canonicalPaths);
    let conflict = Option.none<string>();
    const inspections = yield* Effect.gen(function* () {
      if (!inline && Option.isNone(manifestRoot)) return yield* inspectManagedPresence(args);
      const path = yield* Path.Path;
      const manifest = Option.isNone(manifestRoot)
        ? undefined
        : yield* decodeMcpServerManifestAt(
            path.join(manifestRoot.value, MCP_SERVER_MANIFEST_FILENAME),
          );
      const plan = planMcpServerTargets({
        agentIds: args.agentIds,
        scope: args.scope,
        serverName: args.node.name,
        declaration,
        manifest,
        values:
          manifest === undefined
            ? declaration.env
            : mcpProjectionInputValues(declaration.env, collectSecretInputNames(manifest)),
        enabled: true,
      });
      if (plan._tag === "invalid") {
        return yield* new McpDefinitionInvalid({ detail: plan.detail, cause: plan.cause });
      }
      conflict = Option.fromUndefinedOr(
        plan.agents.flatMap((agent) => (agent._tag === "blocked" ? [agent.reason] : []))[0],
      );
      return yield* Effect.forEach(plan.agents, (agent) => inspectPlannedAgent(args, agent), {
        concurrency: 16,
      });
    });
    return {
      inspections,
      outcomes: inspections.map((inspection) =>
        mcpInspectionOutcome({ name: args.node.name, inspection, state }),
      ),
      current: mcpInspectionsCurrent(inspections),
      conflict,
    };
  });

/** Every AXM-managed entry the configured agents' native files hold, by agent. */
export const collectManagedAgentMcpServers = (
  args: CollectManagedAgentMcpServersArgs,
): Effect.Effect<
  ReadonlyArray<ManagedAgentMcpServer>,
  McpInspectionError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const groups = groupConfiguredMcpTargets({ agentIds: args.agentIds, scope: args.scope });
    const perGroup = yield* Effect.forEach(
      groups,
      (group) =>
        Effect.gen(function* () {
          const [first] = group.members;
          if (first === undefined) return [];
          const target = first.target;
          const absolutePath = yield* resolveAgentMcpConfigTargetPath(args.workspaceRoot, target);
          const raw = yield* readNativeMcpConfig(absolutePath);
          if (Option.isNone(raw)) return [];
          const names = yield* managedNativeMcpEntryNames({
            format: target.format,
            configPath: absolutePath,
            raw: raw.value,
            serversKey: first.config.serversKey,
          });
          return names.flatMap((serverName) =>
            group.members.map((member) => ({
              agentId: member.agentId,
              serverName,
              path: target.path,
              absolutePath,
              target,
            })),
          );
        }),
      { concurrency: 16 },
    );
    return perGroup.flat();
  });
