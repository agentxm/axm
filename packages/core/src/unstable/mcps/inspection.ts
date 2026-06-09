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
  AGENTS_BY_ID,
  type Agent,
  type AgentId,
  type McpConfig,
  type McpConfigTarget,
  type McpTransport,
} from "../agent-capabilities/index.js";
import { makeAppError, type AppError } from "../app-error/index.js";
import type { McpServerEntry } from "../settings/index.js";
import { parseTomlValue, stringifyToml, stringifyTomlKey } from "../toml/index.js";
import { managedYamlNames as readManagedYamlNames, readYamlEntry } from "../yaml/index.js";
import { resolveAgentMcpConfigTargetPath } from "./config-writer.js";
import { isAxmManagedMcpEntry } from "./metadata.js";
import { diffAgentEntry, projectExpectedEntry, type ExpectedAgentEntry } from "./projection.js";

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

export type AgentMcpInspectionStatus = "unsupported" | "absent" | "match" | "drift" | "unmanaged";

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

const isCapabilityAgentId = (agentId: string): agentId is AgentId => agentId in AGENTS_BY_ID;

const readOptional = (
  configPath: string,
): Effect.Effect<Option.Option<string>, AppError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(configPath).pipe(Effect.catch(() => Effect.succeed(false)));
    if (!exists) return Option.none();
    return yield* fs.readFileString(configPath).pipe(
      Effect.map(Option.some),
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to read MCP config: ${configPath}`,
          cause: error,
        }),
      ),
    );
  });

const parseJsonObject = (
  configPath: string,
  raw: string,
): Effect.Effect<Readonly<Record<string, unknown>>, AppError> =>
  Effect.sync(() => {
    const errors: Array<ParseError> = [];
    const parsed: unknown = parse(raw, errors, { allowTrailingComma: true });
    if (errors.length > 0) throw errors;
    if (!isRecord(parsed)) throw new Error("MCP config root must be an object");
    return parsed;
  }).pipe(
    Effect.mapError((error) =>
      makeAppError({
        code: "validation",
        detail: `Invalid MCP config JSON/JSONC: ${configPath}`,
        cause: error,
      }),
    ),
  );

const readJsonEntry = (
  configPath: string,
  raw: string,
  serversKey: string,
  serverName: string,
): Effect.Effect<Option.Option<Readonly<Record<string, unknown>>>, AppError> =>
  Effect.gen(function* () {
    const parsed = yield* parseJsonObject(configPath, raw);
    const servers = parsed[serversKey];
    if (!isRecord(servers)) return Option.none();
    const entry = servers[serverName];
    return isRecord(entry) ? Option.some(entry) : Option.none();
  });

const mapYamlError = (configPath: string, error: unknown): AppError =>
  makeAppError({
    code: "validation",
    detail: `Invalid MCP config YAML: ${configPath}`,
    cause: error,
  });

const readYamlConfigEntry = (
  configPath: string,
  raw: string,
  serversKey: string,
  serverName: string,
): Effect.Effect<Option.Option<Readonly<Record<string, unknown>>>, AppError> =>
  Effect.sync(() => readYamlEntry(raw, serversKey, serverName)).pipe(
    Effect.map((entry) => Option.fromUndefinedOr(entry)),
    Effect.mapError((error) => mapYamlError(configPath, error)),
  );

const managedTomlStart = (serverName: string): string =>
  `# axm managed mcp-server ${serverName} start`;

const managedTomlEnd = (serverName: string): string => `# axm managed mcp-server ${serverName} end`;

const managedTomlBlock = (raw: string, serverName: string): Option.Option<string> => {
  const start = managedTomlStart(serverName);
  const end = managedTomlEnd(serverName);
  const startIndex = raw.indexOf(start);
  if (startIndex < 0) return Option.none();
  const blockStart = startIndex + start.length;
  const endIndex = raw.indexOf(end, blockStart);
  if (endIndex < 0) return Option.none();
  return Option.some(raw.slice(blockStart, endIndex).trim());
};

const expectedTomlBlock = (
  serversKey: string,
  serverName: string,
  entry: Readonly<Record<string, unknown>>,
): string => stringifyToml({ [serversKey]: { [serverName]: entry } }).trim();

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

const inspectActual = (args: {
  readonly target: McpConfigTarget;
  readonly configPath: string;
  readonly serversKey: string;
  readonly serverName: string;
  readonly expected: ExpectedAgentEntry;
}): Effect.Effect<
  {
    readonly status: Exclude<AgentMcpInspectionStatus, "unsupported">;
    readonly fields: ReadonlyArray<string>;
    readonly actual?: Readonly<Record<string, unknown>>;
  },
  AppError,
  FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    const raw = yield* readOptional(args.configPath);
    if (Option.isNone(raw)) return { status: "absent", fields: [] };

    if (args.target.format === "toml") {
      const actualBlock = managedTomlBlock(raw.value, args.serverName);
      if (Option.isNone(actualBlock)) return { status: "absent", fields: [] };
      if (args.expected._tag !== "projected") return { status: "drift", fields: ["transport"] };
      const expectedBlock = expectedTomlBlock(
        args.serversKey,
        args.serverName,
        args.expected.entry,
      );
      const actual = parseTomlEntry(actualBlock.value, args.serversKey, args.serverName);
      return actualBlock.value === expectedBlock
        ? { status: "match", fields: [], actual }
        : { status: "drift", fields: ["entry"], actual };
    }

    const actual =
      args.target.format === "yaml"
        ? yield* readYamlConfigEntry(args.configPath, raw.value, args.serversKey, args.serverName)
        : yield* readJsonEntry(args.configPath, raw.value, args.serversKey, args.serverName);
    if (Option.isNone(actual)) return { status: "absent", fields: [] };
    if (!isAxmManagedMcpEntry(actual.value)) {
      return { status: "unmanaged", fields: [], actual: actual.value };
    }
    const drift = diffAgentEntry(args.expected, actual.value);
    if (drift._tag === "match") return { status: "match", fields: [], actual: actual.value };
    if (drift._tag === "drift") {
      return { status: "drift", fields: drift.fields, actual: actual.value };
    }
    return { status: "absent", fields: [] };
  });

export const inspectAgentMcpServer = (
  args: InspectAgentMcpServerArgs,
): Effect.Effect<AgentMcpServerInspection, AppError, FileSystem.FileSystem | Path.Path> =>
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

    const capability = AGENTS_BY_ID[args.agentId].capabilities["mcp-server"];
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

    const config = capability.axm.writer.config;
    const target = config.targets.find((item) => item.scope === args.scope);
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

    const projected = projectExpectedEntry({
      serverName: args.serverName,
      entry: args.entry,
      stdio: config.stdio,
      remote: config.remote,
      nativeEnabled: config.nativeEnabled,
      envExpansion: capability.native.mcpEnvExpansion,
    });
    const absolutePath = yield* resolveAgentMcpConfigTargetPath(args.workspaceRoot, target);
    if (projected._tag !== "projected") {
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
      warnings: projected.warnings,
      expected: projected.entry,
      ...(actual.actual === undefined ? {} : { actual: actual.actual }),
    };
  });

export const inspectMcpServerAcrossAgents = (args: {
  readonly workspaceRoot: string;
  readonly scope: "project" | "user";
  readonly agentIds: ReadonlyArray<string>;
  readonly serverName: string;
  readonly entry: McpServerEntry;
}): Effect.Effect<
  ReadonlyArray<AgentMcpServerInspection>,
  AppError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.forEach(
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

const managedJsonNames = (
  configPath: string,
  raw: string,
  serversKey: string,
): Effect.Effect<ReadonlyArray<string>, AppError> =>
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
): Effect.Effect<ReadonlyArray<string>, AppError> =>
  Effect.sync(() => readManagedYamlNames(raw, serversKey, isAxmManagedMcpEntry)).pipe(
    Effect.mapError((error) => mapYamlError(configPath, error)),
  );

const managedTomlNames = (raw: string): ReadonlyArray<string> => {
  const names: Array<string> = [];
  const pattern = /^# axm managed mcp-server ([a-z0-9][a-z0-9-]*) start$/gm;
  let match = pattern.exec(raw);
  while (match !== null) {
    const name = match[1];
    if (name !== undefined) names.push(name);
    match = pattern.exec(raw);
  }
  return names;
};

export const collectManagedAgentMcpServers = (
  args: CollectManagedAgentMcpServersArgs,
): Effect.Effect<
  ReadonlyArray<ManagedAgentMcpServer>,
  AppError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const perAgent = yield* Effect.forEach(
      args.agentIds,
      (agentId) =>
        Effect.gen(function* () {
          if (!isCapabilityAgentId(agentId)) return [];
          const capability = AGENTS_BY_ID[agentId].capabilities["mcp-server"];
          if (!hasMcpConfig(capability)) return [];
          const targets = capability.axm.writer.config.targets.filter(
            (target) => target.scope === args.scope,
          );
          const perTarget = yield* Effect.forEach(
            targets,
            (target) =>
              Effect.gen(function* () {
                const absolutePath = yield* resolveAgentMcpConfigTargetPath(
                  args.workspaceRoot,
                  target,
                );
                const raw = yield* readOptional(absolutePath);
                if (Option.isNone(raw)) return [];
                const names = yield* Effect.gen(function* () {
                  switch (target.format) {
                    case "toml":
                      return managedTomlNames(raw.value);
                    case "yaml":
                      return yield* managedYamlNames(
                        absolutePath,
                        raw.value,
                        capability.axm.writer.config.serversKey,
                      );
                    case "json":
                    case "jsonc":
                    case "starlark":
                    case "vscode-settings":
                      return yield* managedJsonNames(
                        absolutePath,
                        raw.value,
                        capability.axm.writer.config.serversKey,
                      );
                  }
                });
                return names.map((serverName) => ({
                  agentId,
                  serverName,
                  path: target.path,
                  absolutePath,
                  target,
                }));
              }),
            { concurrency: "unbounded" },
          );
          return perTarget.flat();
        }),
      { concurrency: "unbounded" },
    );
    return perAgent.flat();
  });
