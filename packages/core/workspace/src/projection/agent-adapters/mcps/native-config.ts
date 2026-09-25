/**
 * Read-side mechanics for agent-native MCP configuration files: where a
 * target lives, how its bytes decode, and which entries AXM manages in it.
 *
 * Prune, observation, and the writer all read native files through this
 * module, so a file AXM cannot decode means the same thing to every one of
 * them: a configuration fault to report, never an empty file to pass over.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { parse, type ParseError } from "jsonc-parser";
import type { McpConfigTarget } from "@agentxm/extension-model/unstable/agent-capabilities";
import { isPathSafe } from "@agentxm/extension-model/unstable/path-types";
import { getHome } from "../constants.js";
import { McpConfigInvalid, McpConfigIoFailed } from "../errors.js";
import { managedKeyedBlockNames } from "../managed-regions-keyed-block.js";
import { parseTomlValue, stringifyTomlKey } from "../toml.js";
import { managedYamlNames, readYamlEntry } from "../yaml.js";
import { isAxmManagedMcpEntry } from "./entry-semantics.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Where a native MCP config target lives on disk for this workspace. */
export const resolveAgentMcpConfigTargetPath = (
  workspaceRoot: string,
  target: McpConfigTarget,
): Effect.Effect<string, McpConfigInvalid, Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const home = yield* getHome;
    const base =
      target.scope === "user"
        ? target.path.startsWith("~/")
          ? path.join(home, target.path.slice(2))
          : path.resolve(home, target.path)
        : path.resolve(workspaceRoot, target.path);

    if (target.scope === "project" && !isPathSafe(path, workspaceRoot, base)) {
      return yield* new McpConfigInvalid({
        detail: `MCP config target escapes workspace root: ${target.path}`,
      });
    }
    return base;
  });

/** The native file's bytes, or none when it does not exist. */
export const readNativeMcpConfig = (
  configPath: string,
): Effect.Effect<Option.Option<string>, McpConfigIoFailed, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs
      .exists(configPath)
      .pipe(
        Effect.mapError(
          (cause) =>
            new McpConfigIoFailed({ detail: `Failed to inspect MCP config: ${configPath}`, cause }),
        ),
      );
    if (!exists) return Option.none();
    return yield* fs.readFileString(configPath).pipe(
      Effect.map(Option.some),
      Effect.mapError(
        (cause) =>
          new McpConfigIoFailed({ detail: `Failed to read MCP config: ${configPath}`, cause }),
      ),
    );
  });

/** A JSON-like native config with its servers map validated. */
export interface DecodedJsonMcpConfig {
  readonly root: Readonly<Record<string, unknown>>;
  /** The servers map, or none when the key is absent. */
  readonly servers: Readonly<Record<string, unknown>> | undefined;
}

/**
 * Decode a JSON, JSONC, Starlark-style, or VS Code settings MCP config. The
 * root must be an object and the servers key, when present, must hold one.
 */
export const decodeJsonMcpConfig = (
  configPath: string,
  raw: string,
  serversKey: string,
): Effect.Effect<DecodedJsonMcpConfig, McpConfigInvalid> =>
  Effect.gen(function* () {
    const root = yield* Effect.try({
      try: () => {
        const errors: Array<ParseError> = [];
        const parsed: unknown = parse(raw, errors, { allowTrailingComma: true });
        if (errors.length > 0) throw errors;
        return parsed;
      },
      catch: (cause) =>
        new McpConfigInvalid({ detail: `Invalid MCP config JSON/JSONC: ${configPath}`, cause }),
    });
    if (!isRecord(root)) {
      return yield* new McpConfigInvalid({
        detail: `Invalid MCP config format: ${configPath} (root must be an object)`,
      });
    }
    const servers = root[serversKey];
    if (servers !== undefined && !isRecord(servers)) {
      return yield* new McpConfigInvalid({
        detail: `Invalid MCP config format: ${configPath} (${serversKey} must be an object)`,
      });
    }
    return { root, servers };
  });

const yamlInvalid = (configPath: string, cause: unknown): McpConfigInvalid =>
  new McpConfigInvalid({ detail: `Invalid MCP config YAML: ${configPath}`, cause });

export interface NativeMcpConfigRead {
  readonly format: McpConfigTarget["format"];
  readonly configPath: string;
  readonly raw: string;
  readonly serversKey: string;
}

/**
 * The entry one server holds in a keyed (JSON-like or YAML) native config.
 * TOML entries live in fenced blocks and are read by their block instead.
 */
export const readNativeMcpEntry = (
  args: NativeMcpConfigRead & { readonly serverName: string },
): Effect.Effect<Option.Option<Readonly<Record<string, unknown>>>, McpConfigInvalid> => {
  switch (args.format) {
    case "yaml":
      return Effect.try({
        try: () => readYamlEntry(args.raw, args.serversKey, args.serverName),
        catch: (cause) => yamlInvalid(args.configPath, cause),
      }).pipe(Effect.map((entry) => Option.fromUndefinedOr(entry)));
    case "toml":
      return Effect.succeed(Option.none());
    case "json":
    case "jsonc":
    case "starlark":
    case "vscode-settings":
      return decodeJsonMcpConfig(args.configPath, args.raw, args.serversKey).pipe(
        Effect.map(({ servers }) => {
          const entry = servers?.[args.serverName];
          return isRecord(entry) ? Option.some(entry) : Option.none();
        }),
      );
  }
};

/** The names of every AXM-managed server entry a native config holds. */
export const managedNativeMcpEntryNames = (
  args: NativeMcpConfigRead,
): Effect.Effect<ReadonlyArray<string>, McpConfigInvalid> => {
  switch (args.format) {
    case "toml":
      return Effect.succeed(managedKeyedBlockNames(args.raw));
    case "yaml":
      return Effect.try({
        try: () => managedYamlNames(args.raw, args.serversKey, isAxmManagedMcpEntry),
        catch: (cause) => yamlInvalid(args.configPath, cause),
      });
    case "json":
    case "jsonc":
    case "starlark":
    case "vscode-settings":
      return decodeJsonMcpConfig(args.configPath, args.raw, args.serversKey).pipe(
        Effect.map(({ servers }) =>
          Object.entries(servers ?? {}).flatMap(([name, entry]) =>
            isRecord(entry) && isAxmManagedMcpEntry(entry) ? [name] : [],
          ),
        ),
      );
  }
};

const tomlTableHeader = (serversKey: string, serverName: string, suffix?: string): string =>
  `[${stringifyTomlKey(serversKey)}.${stringifyTomlKey(serverName)}${suffix === undefined ? "" : `.${stringifyTomlKey(suffix)}`}]`;

/** Whether a TOML config declares the server's table anywhere, fenced or not. */
export const hasTomlMcpEntry = (raw: string, serversKey: string, serverName: string): boolean => {
  const header = tomlTableHeader(serversKey, serverName);
  return raw.split(/\r?\n/u).some((line) => line.trim() === header);
};

/**
 * Decode one server's TOML table, with its nested tables, from a block of
 * lines. Keys come from the file, so they are collected in Maps and only
 * become object keys through `Object.fromEntries`, never by assignment.
 */
export const parseTomlMcpEntry = (
  rawBlock: string,
  serversKey: string,
  serverName: string,
): Readonly<Record<string, unknown>> => {
  const rootHeader = tomlTableHeader(serversKey, serverName);
  let currentTable: "root" | string | null = null;
  const root = new Map<string, unknown>();
  const nested = new Map<string, Map<string, unknown>>();

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
      if (currentTable !== null && currentTable !== "root") nested.set(currentTable, new Map());
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator <= 0 || currentTable === null) continue;
    const key = trimmed.slice(0, separator).trim().replace(/^"|"$/g, "");
    const value = parseTomlValue(trimmed.slice(separator + 1).trim());
    if (currentTable === "root") {
      root.set(key, value);
      continue;
    }
    const current = nested.get(currentTable) ?? new Map<string, unknown>();
    current.set(key, value);
    nested.set(currentTable, current);
  }

  return Object.fromEntries([
    ...root,
    ...[...nested].map(([table, values]) => [table, Object.fromEntries(values)] as const),
  ]);
};
