/**
 * Agent MCP config inspection helpers.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { parse, type ParseError } from "jsonc-parser";
import {
  CONFIGURABLE_AGENTS_BY_ID,
  type Agent,
  type ConfigurableAgentId,
  type McpConfig,
  type McpConfigTarget,
  type McpTransport,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import { type McpInspectionError } from "./errors.js";
import type { McpServerEntry } from "@agentxm/workspace-state";
import {
  decodeMcpServerManifestAt,
  groupConfiguredMcpTargets,
  inferInlineRemoteTransport,
  isAxmManagedMcpEntry,
  managedKeyedBlockNames,
  managedYamlNames as readManagedYamlNames,
  McpConfigInvalid,
  McpConfigIoFailed,
  McpDefinitionInvalid,
  McpOwnershipMarkerInvalid,
  McpSharedTargetConflict,
  parseTomlValue,
  projectExpectedEntry,
  readYamlEntry,
  reconcileKeyedBlock,
  resolveAgentMcpConfigTargetPath,
  resolveMcpServer,
  resolveSharedMcpTarget,
  stringifyTomlKey,
  type ExpectedAgentEntry,
  type SharedMcpTransport,
  validateManifestMcpServerTargets,
} from "@agentxm/agent-integration";
import { MCP_SERVER_MANIFEST_FILENAME } from "@agentxm/extension-model/unstable/mcps/manifest-schema";
import { diffAgentEntry } from "./drift.js";

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

export interface InspectAgentMcpServerArgs {
  readonly workspaceRoot: string;
  readonly scope: "project" | "user";
  readonly agentId: string;
  readonly serverName: string;
  readonly entry: McpServerEntry;
}

interface InternalInspectAgentMcpServerArgs extends InspectAgentMcpServerArgs {
  readonly state?: "projected" | "current";
  readonly projection?: {
    readonly config: McpConfig;
    readonly target: McpConfigTarget;
    readonly expected?: ExpectedAgentEntry;
    readonly warnings?: ReadonlyArray<string>;
  };
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasMcpConfig = (capability: AgentMcpCapability): capability is ConfiguredMcpCapability =>
  capability.axm.writer !== null && "transports" in capability.native;

const isCapabilityAgentId = (agentId: string): agentId is ConfigurableAgentId =>
  agentId in CONFIGURABLE_AGENTS_BY_ID;

const readOptional = (
  configPath: string,
): Effect.Effect<Option.Option<string>, McpInspectionError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(configPath).pipe(Effect.catch(() => Effect.succeed(false)));
    if (!exists) return Option.none();
    return yield* fs.readFileString(configPath).pipe(
      Effect.map(Option.some),
      Effect.mapError(
        (cause) =>
          new McpConfigIoFailed({ detail: `Failed to read MCP config: ${configPath}`, cause }),
      ),
    );
  });

const parseJsonObject = (
  configPath: string,
  raw: string,
): Effect.Effect<Readonly<Record<string, unknown>>, McpInspectionError> =>
  Effect.try({
    try: () => {
      const errors: Array<ParseError> = [];
      const parsed: unknown = parse(raw, errors, { allowTrailingComma: true });
      if (errors.length > 0) throw errors;
      if (!isRecord(parsed)) throw new Error("MCP config root must be an object");
      return parsed;
    },
    catch: (error) =>
      new McpConfigInvalid({
        detail: `Invalid MCP config JSON/JSONC: ${configPath}`,
        cause: error,
      }),
  });

const readJsonEntry = (
  configPath: string,
  raw: string,
  serversKey: string,
  serverName: string,
): Effect.Effect<Option.Option<Readonly<Record<string, unknown>>>, McpInspectionError> =>
  Effect.gen(function* () {
    const parsed = yield* parseJsonObject(configPath, raw);
    const servers = parsed[serversKey];
    if (!isRecord(servers)) return Option.none();
    const entry = servers[serverName];
    return isRecord(entry) ? Option.some(entry) : Option.none();
  });

const mapYamlError = (configPath: string, error: unknown): McpConfigInvalid =>
  new McpConfigInvalid({
    detail: `Invalid MCP config YAML: ${configPath}`,
    cause: error,
  });

const readYamlConfigEntry = (
  configPath: string,
  raw: string,
  serversKey: string,
  serverName: string,
): Effect.Effect<Option.Option<Readonly<Record<string, unknown>>>, McpInspectionError> =>
  Effect.try({
    try: () => readYamlEntry(raw, serversKey, serverName),
    catch: (error) => mapYamlError(configPath, error),
  }).pipe(Effect.map((entry) => Option.fromUndefinedOr(entry)));

const managedTomlBlock = (raw: string, serverName: string) =>
  reconcileKeyedBlock({
    content: raw,
    region: `mcp-server:${serverName}`,
    owner: `@agentxm/mcps/${serverName}`,
    rendered: "",
  });

const tableHeader = (serversKey: string, serverName: string, suffix?: string): string =>
  `[${stringifyTomlKey(serversKey)}.${stringifyTomlKey(serverName)}${suffix === undefined ? "" : `.${stringifyTomlKey(suffix)}`}]`;

const parseTomlEntry = (
  rawBlock: string,
  serversKey: string,
  serverName: string,
): Readonly<Record<string, unknown>> => {
  const rootHeader = tableHeader(serversKey, serverName);
  let currentTable: "root" | string | null = null;
  const root: Record<string, unknown> = {};
  const nested: Record<string, Record<string, unknown>> = {};

  for (const line of rawBlock.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      if (trimmed === rootHeader) {
        currentTable = "root";
        continue;
      }
      const nestedMatch = /^\[[^.]+(?:\.[^\]]+)\.([A-Za-z0-9_-]+|"[^"]+")\]$/.exec(trimmed);
      const nestedKey = nestedMatch?.[1]?.replace(/^"|"$/g, "");
      currentTable =
        nestedKey !== undefined && trimmed.startsWith(rootHeader.slice(0, -1)) ? nestedKey : null;
      if (currentTable !== null && currentTable !== "root") nested[currentTable] = {};
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator <= 0 || currentTable === null) continue;
    const key = trimmed.slice(0, separator).trim().replace(/^"|"$/g, "");
    const value = parseTomlValue(trimmed.slice(separator + 1).trim());
    if (currentTable === "root") {
      root[key] = value;
      continue;
    }
    const current = nested[currentTable] ?? {};
    current[key] = value;
    nested[currentTable] = current;
  }

  return { ...root, ...nested };
};

const hasTomlEntry = (raw: string, serversKey: string, serverName: string): boolean => {
  const header = tableHeader(serversKey, serverName);
  return raw.split(/\r?\n/u).some((line) => line.trim() === header);
};

type McpInspectionExpectation = ExpectedAgentEntry | { readonly _tag: "managed" };

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
    const raw = yield* readOptional(args.configPath);
    if (Option.isNone(raw)) return { status: "absent", fields: [] };

    if (args.target.format === "toml") {
      const actualBlock = managedTomlBlock(raw.value, args.serverName);
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
        if (!hasTomlEntry(raw.value, args.serversKey, args.serverName)) {
          return { status: "absent", fields: [] };
        }
        const unfenced = parseTomlEntry(raw.value, args.serversKey, args.serverName);
        return isAxmManagedMcpEntry(unfenced)
          ? { status: "drift", fields: ["ownership-marker"], actual: unfenced }
          : { status: "unmanaged", fields: [], actual: unfenced };
      }
      const actual = parseTomlEntry(actualBlock.body, args.serversKey, args.serverName);
      if (args.expected._tag === "managed") {
        return isAxmManagedMcpEntry(actual)
          ? { status: "match", fields: [], actual }
          : { status: "drift", fields: ["x-axm"], actual };
      }
      if (args.expected._tag !== "projected") return { status: "drift", fields: ["transport"] };
      const drift = diffAgentEntry(args.expected, actual);
      if (drift._tag === "match") return { status: "match", fields: [], actual };
      if (drift._tag === "unmanaged") return { status: "unmanaged", fields: [], actual };
      if (drift._tag === "drift") return { status: "drift", fields: drift.fields, actual };
      return { status: "absent", fields: [] };
    }

    const actual =
      args.target.format === "yaml"
        ? yield* readYamlConfigEntry(args.configPath, raw.value, args.serversKey, args.serverName)
        : yield* readJsonEntry(args.configPath, raw.value, args.serversKey, args.serverName);
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

const inspectAgentMcpServerInternal = (
  args: InternalInspectAgentMcpServerArgs,
): Effect.Effect<AgentMcpServerInspection, McpInspectionError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    if (!isCapabilityAgentId(args.agentId)) {
      return {
        agentId: args.agentId,
        path: "",
        absolutePath: "",
        status: "unsupported",
        fields: [],
        warnings: [],
        reason: `${args.agentId} has no MCP capability catalog entry`,
      };
    }

    const capability = CONFIGURABLE_AGENTS_BY_ID[args.agentId].capabilities["mcp-server"];
    if (!hasMcpConfig(capability)) {
      return {
        agentId: args.agentId,
        path: "",
        absolutePath: "",
        status: "unsupported",
        fields: [],
        warnings: [],
        reason: `${args.agentId} does not have MCP config support`,
      };
    }

    const nativeConfig = capability.axm.writer.config;
    const config = args.projection?.config ?? nativeConfig;
    const target =
      args.projection?.target ?? nativeConfig.targets.find((item) => item.scope === args.scope);
    if (target === undefined) {
      return {
        agentId: args.agentId,
        path: "",
        absolutePath: "",
        status: "unsupported",
        fields: [],
        warnings: [],
        reason: `${args.agentId} has no ${args.scope} MCP config target`,
      };
    }

    const projected: McpInspectionExpectation =
      args.projection?.expected ??
      (args.entry.command === undefined && args.entry.url === undefined
        ? { _tag: "managed" }
        : projectExpectedEntry({
            serverName: args.serverName,
            entry: args.entry,
            stdio: config.stdio,
            remote: config.remote,
            activationField: config.activationField,
            envExpansion: capability.native.mcpEnvExpansion,
          }));
    const absolutePath = yield* resolveAgentMcpConfigTargetPath(args.workspaceRoot, target);
    if (projected._tag === "unsupported") {
      return {
        agentId: args.agentId,
        path: target.path,
        absolutePath,
        status: "unsupported",
        fields: [],
        warnings: [],
        reason: `${args.agentId} ${projected.reason}`,
      };
    }
    if (args.state === "projected") {
      return {
        agentId: args.agentId,
        path: target.path,
        absolutePath,
        status: "match",
        fields: [],
        warnings:
          args.projection?.warnings ?? (projected._tag === "projected" ? projected.warnings : []),
        ...(projected._tag === "projected" ? { expected: projected.entry } : {}),
      };
    }

    const actual = yield* inspectActual({
      target,
      configPath: absolutePath,
      serversKey: config.serversKey,
      serverName: args.serverName,
      expected: projected,
    });
    return {
      agentId: args.agentId,
      path: target.path,
      absolutePath,
      status: actual.status,
      fields: actual.fields,
      warnings:
        args.projection?.warnings ?? (projected._tag === "projected" ? projected.warnings : []),
      ...(projected._tag === "projected" ? { expected: projected.entry } : {}),
      ...(actual.actual === undefined ? {} : { actual: actual.actual }),
    };
  });

export const inspectAgentMcpServer = (
  args: InspectAgentMcpServerArgs,
): Effect.Effect<AgentMcpServerInspection, McpInspectionError, FileSystem.FileSystem | Path.Path> =>
  inspectAgentMcpServerInternal(args);

const inspectionTransportForEntry = (
  entry: McpServerEntry,
): Effect.Effect<SharedMcpTransport, McpInspectionError> => {
  if (entry.command !== undefined) return Effect.succeed("stdio");
  if (entry.url !== undefined) {
    const inference = inferInlineRemoteTransport(entry.url);
    return inference._tag === "supported"
      ? Effect.succeed(inference.transport)
      : Effect.fail(
          new McpDefinitionInvalid({
            detail: "Invalid inline MCP server URL",
            cause: inference.reason,
          }),
        );
  }
  return Effect.fail(
    new McpDefinitionInvalid({ detail: "Inline MCP server has no command or URL" }),
  );
};

export const inspectMcpServerAcrossAgents = (args: {
  readonly workspaceRoot: string;
  readonly scope: "project" | "user";
  readonly agentIds: ReadonlyArray<string>;
  readonly serverName: string;
  readonly entry: McpServerEntry;
  readonly canonicalPaths?: ReadonlyArray<string>;
  readonly state?: "projected" | "current";
}): Effect.Effect<
  ReadonlyArray<AgentMcpServerInspection>,
  McpInspectionError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    if (args.entry.command === undefined && args.entry.url === undefined) {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      let canonicalPath: string | undefined;
      for (const candidate of args.canonicalPaths ?? []) {
        const resolved = path.resolve(args.workspaceRoot, candidate);
        const manifestPath = path.join(resolved, MCP_SERVER_MANIFEST_FILENAME);
        if (yield* fs.exists(manifestPath).pipe(Effect.catch(() => Effect.succeed(false)))) {
          canonicalPath = resolved;
          break;
        }
      }
      if (canonicalPath !== undefined) {
        const manifest = yield* decodeMcpServerManifestAt(
          path.join(canonicalPath, MCP_SERVER_MANIFEST_FILENAME),
        );
        yield* validateManifestMcpServerTargets({
          manifest,
          agentIds: args.agentIds,
          scope: args.scope,
          serverName: args.serverName,
          values: args.entry.env,
          enabled: true,
        });
        const projectedTargets = new Map<
          string,
          { readonly config: McpConfig; readonly target: McpConfigTarget }
        >();
        for (const group of groupConfiguredMcpTargets({
          agentIds: args.agentIds,
          scope: args.scope,
        })) {
          const firstRunnable = group.members
            .flatMap((member) => {
              if (!isCapabilityAgentId(member.agentId)) return [];
              const capability =
                CONFIGURABLE_AGENTS_BY_ID[member.agentId].capabilities["mcp-server"];
              if (!hasMcpConfig(capability)) return [];
              const resolution = resolveMcpServer({
                manifest,
                localName: args.serverName,
                capability,
                values: args.entry.env,
                enabled: true,
              });
              return resolution._tag === "resolved" || resolution._tag === "needs-input"
                ? [resolution]
                : [];
            })
            .at(0);
          if (firstRunnable === undefined) continue;
          const shared = resolveSharedMcpTarget({
            members: group.members,
            transport: firstRunnable.transport,
          });
          if (shared._tag === "conflict") {
            return yield* new McpSharedTargetConflict({ reason: shared.reason });
          }
          for (const member of group.members) {
            projectedTargets.set(member.agentId, { config: shared.config, target: member.target });
          }
        }
        return yield* Effect.forEach(
          args.agentIds,
          (agentId) =>
            Effect.gen(function* () {
              if (!isCapabilityAgentId(agentId)) {
                return yield* inspectAgentMcpServer({ ...args, agentId });
              }
              const capability = CONFIGURABLE_AGENTS_BY_ID[agentId].capabilities["mcp-server"];
              if (!hasMcpConfig(capability)) {
                return yield* inspectAgentMcpServer({ ...args, agentId });
              }
              const nativeConfig = capability.axm.writer.config;
              const projection = projectedTargets.get(agentId);
              const config = projection?.config ?? nativeConfig;
              const target =
                projection?.target ??
                nativeConfig.targets.find(({ scope }) => scope === args.scope);
              if (target === undefined) {
                return yield* inspectAgentMcpServer({ ...args, agentId });
              }
              const absolutePath = yield* resolveAgentMcpConfigTargetPath(
                args.workspaceRoot,
                target,
              );
              const projectedCapability: ConfiguredMcpCapability = {
                ...capability,
                axm: { ...capability.axm, writer: { config } },
              };
              const resolution = resolveMcpServer({
                manifest,
                localName: args.serverName,
                capability: projectedCapability,
                values: args.entry.env,
                enabled: true,
              });
              if (resolution._tag === "no-distribution" || resolution._tag === "nothing-runnable") {
                return {
                  agentId,
                  path: target.path,
                  absolutePath,
                  status: "unsupported" as const,
                  fields: [],
                  warnings: [],
                  reason: resolution.reason,
                };
              }
              if (resolution._tag === "needs-input") {
                return {
                  agentId,
                  path: target.path,
                  absolutePath,
                  status: "blocked" as const,
                  fields: [],
                  warnings: resolution.warnings,
                  reason: resolution.warnings.join("; "),
                };
              }
              if (args.state === "projected") {
                return {
                  agentId,
                  path: target.path,
                  absolutePath,
                  status: "match" as const,
                  fields: [],
                  warnings: resolution.warnings,
                  expected: resolution.entry,
                };
              }
              return yield* inspectAgentMcpServerInternal({
                workspaceRoot: args.workspaceRoot,
                scope: args.scope,
                agentId,
                serverName: args.serverName,
                entry: args.entry,
                projection: {
                  config,
                  target,
                  expected: { _tag: "projected", entry: resolution.entry, warnings: [] },
                  warnings: resolution.warnings,
                },
              });
            }),
          { concurrency: "unbounded" },
        );
      }
      return yield* Effect.forEach(
        args.agentIds,
        (agentId) =>
          inspectAgentMcpServer({
            workspaceRoot: args.workspaceRoot,
            scope: args.scope,
            agentId,
            serverName: args.serverName,
            entry: args.entry,
          }),
        { concurrency: "unbounded" },
      );
    }
    const transport = yield* inspectionTransportForEntry(args.entry);
    const groups = groupConfiguredMcpTargets({ agentIds: args.agentIds, scope: args.scope });

    const byAgentId = new Map<string, AgentMcpServerInspection>();
    for (const group of groups) {
      const members = group.members;
      const resolution = resolveSharedMcpTarget({ members, transport });
      if (resolution._tag === "conflict") {
        return yield* new McpSharedTargetConflict({ reason: resolution.reason });
      }
      const inspections = yield* Effect.forEach(
        members,
        (member) =>
          inspectAgentMcpServerInternal({
            workspaceRoot: args.workspaceRoot,
            scope: args.scope,
            agentId: member.agentId,
            serverName: args.serverName,
            entry: args.entry,
            ...(args.state === undefined ? {} : { state: args.state }),
            projection: {
              config: resolution.config,
              target: member.target,
            },
          }),
        { concurrency: "unbounded" },
      );
      for (const inspection of inspections) {
        byAgentId.set(inspection.agentId, inspection);
      }
    }

    return yield* Effect.forEach(
      args.agentIds,
      (agentId) => {
        const resolved = byAgentId.get(agentId);
        return resolved === undefined
          ? inspectAgentMcpServerInternal({
              workspaceRoot: args.workspaceRoot,
              scope: args.scope,
              agentId,
              serverName: args.serverName,
              entry: args.entry,
              ...(args.state === undefined ? {} : { state: args.state }),
            })
          : Effect.succeed(resolved);
      },
      { concurrency: "unbounded" },
    );
  });

const managedJsonNames = (
  configPath: string,
  raw: string,
  serversKey: string,
): Effect.Effect<ReadonlyArray<string>, McpInspectionError> =>
  Effect.gen(function* () {
    const parsed = yield* parseJsonObject(configPath, raw);
    const servers = parsed[serversKey];
    if (!isRecord(servers)) return [];
    return Object.entries(servers).flatMap(([name, entry]) =>
      isRecord(entry) && isAxmManagedMcpEntry(entry) ? [name] : [],
    );
  });

const managedYamlNames = (
  configPath: string,
  raw: string,
  serversKey: string,
): Effect.Effect<ReadonlyArray<string>, McpInspectionError> =>
  Effect.try({
    try: () => readManagedYamlNames(raw, serversKey, isAxmManagedMcpEntry),
    catch: (error) => mapYamlError(configPath, error),
  });

const managedTomlNames = managedKeyedBlockNames;

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
          const raw = yield* readOptional(absolutePath);
          if (Option.isNone(raw)) return [];
          const names = yield* Effect.gen(function* () {
            switch (target.format) {
              case "toml":
                return managedTomlNames(raw.value);
              case "yaml":
                return yield* managedYamlNames(absolutePath, raw.value, first.config.serversKey);
              case "json":
              case "jsonc":
              case "starlark":
              case "vscode-settings":
                return yield* managedJsonNames(absolutePath, raw.value, first.config.serversKey);
            }
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
      { concurrency: "unbounded" },
    );
    return perGroup.flat();
  });
