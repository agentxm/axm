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
import { parse as parseToml } from "smol-toml";
import type { McpConfigTarget } from "@agentxm/extension-model/unstable/agent-capabilities";
import { McpConfigInvalid, McpConfigIoFailed } from "../errors.js";
import { parseYaml } from "../yaml.js";
import { assertNativeMutationWithin } from "../../locations/index.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Where a native MCP config target lives on disk for this workspace. */
export const resolveAgentMcpConfigTargetPath = (
  workspaceRoot: string,
  target: McpConfigTarget,
): Effect.Effect<string, McpConfigInvalid, Path.Path | FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const base = path.resolve(
      workspaceRoot,
      target.scope === "user" && target.path.startsWith("~/") ? target.path.slice(2) : target.path,
    );

    const nativeRoot = target.nativeRoot ?? workspaceRoot;
    // The native boundary already checks the project root when the paths are identical.
    if (target.scope === "project" && path.resolve(nativeRoot) !== path.resolve(workspaceRoot)) {
      yield* assertNativeMutationWithin(workspaceRoot, base, "content", workspaceRoot).pipe(
        Effect.mapError(
          (cause) =>
            new McpConfigInvalid({
              detail: `Cannot use MCP location ${target.path}: ${cause.reason}`,
              cause,
            }),
        ),
      );
    }
    const address = yield* assertNativeMutationWithin(
      nativeRoot,
      base,
      "content",
      workspaceRoot,
    ).pipe(
      Effect.mapError(
        (cause) =>
          new McpConfigInvalid({
            detail: `Cannot use MCP location ${target.path}: ${cause.reason}`,
            cause,
          }),
      ),
    );
    return address.referentPath ?? address.entryPath;
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

/** Validate every ancestor so a native writer cannot replace an occupied scalar. */
const readServersMap = (
  root: Readonly<Record<string, unknown>>,
  serversPath: ReadonlyArray<string>,
  configPath: string,
): Effect.Effect<Readonly<Record<string, unknown>> | undefined, McpConfigInvalid> =>
  Effect.gen(function* () {
    if (serversPath.length === 0)
      return yield* new McpConfigInvalid({ detail: `Empty MCP servers path: ${configPath}` });
    let current: Readonly<Record<string, unknown>> = root;
    for (const [index, key] of serversPath.entries()) {
      const value = Object.hasOwn(current, key) ? current[key] : undefined;
      if (value === undefined) return undefined;
      if (!isRecord(value))
        return yield* new McpConfigInvalid({
          detail: `Invalid MCP config format: ${configPath} (${serversPath.slice(0, index + 1).join(".")} must be an object)`,
        });
      current = value;
    }
    return current;
  });

/**
 * Decode a JSON, JSONC, Starlark-style, or VS Code settings MCP config. The
 * root and each present ancestor of the servers container must be objects.
 */
export const decodeJsonMcpConfig = (
  configPath: string,
  raw: string,
  serversPath: ReadonlyArray<string>,
  format: McpConfigTarget["format"] = "jsonc",
): Effect.Effect<DecodedJsonMcpConfig, McpConfigInvalid> =>
  Effect.gen(function* () {
    const root = yield* Effect.try({
      try: () => {
        const errors: Array<ParseError> = [];
        const parsed: unknown = parse(raw, errors, {
          allowTrailingComma: format !== "json",
          disallowComments: format === "json",
        });
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
    const servers = yield* readServersMap(root, serversPath, configPath);
    return { root, servers };
  });

export interface NativeMcpConfigRead {
  readonly format: McpConfigTarget["format"];
  readonly configPath: string;
  readonly raw: string;
  readonly serversPath: ReadonlyArray<string>;
}

/** Decode the complete native document before observing or changing one unit. */
export const readNativeMcpDocument = (
  args: NativeMcpConfigRead,
): Effect.Effect<Readonly<Record<string, unknown>>, McpConfigInvalid> =>
  Effect.gen(function* () {
    if (args.raw.trim().length === 0) return {};
    switch (args.format) {
      case "json":
      case "jsonc":
      case "starlark":
      case "vscode-settings":
        return (yield* decodeJsonMcpConfig(
          args.configPath,
          args.raw,
          args.serversPath,
          args.format,
        )).root;
      case "yaml":
      case "toml": {
        const root = yield* Effect.try({
          try: (): unknown => (args.format === "yaml" ? parseYaml(args.raw) : parseToml(args.raw)),
          catch: (cause) =>
            new McpConfigInvalid({
              detail: `Invalid MCP config ${args.format.toUpperCase()}: ${args.configPath}`,
              cause,
            }),
        });
        if (root === null || root === undefined) return {};
        if (!isRecord(root))
          return yield* new McpConfigInvalid({
            detail: `Invalid MCP config format: ${args.configPath} (root must be an object)`,
          });
        yield* readServersMap(root, args.serversPath, args.configPath);
        return root;
      }
    }
  });

/** Retain occupied keys even when their individual values are invalid. */
export const readNativeMcpValues = (
  args: NativeMcpConfigRead,
): Effect.Effect<Readonly<Record<string, unknown>>, McpConfigInvalid> =>
  readNativeMcpDocument(args).pipe(
    Effect.flatMap((root) =>
      readServersMap(root, args.serversPath, args.configPath).pipe(
        Effect.map((servers) => servers ?? {}),
      ),
    ),
  );

/** Record-shaped server declarations from any supported native config. */
export const readNativeMcpServers = (
  args: NativeMcpConfigRead,
): Effect.Effect<Readonly<Record<string, Readonly<Record<string, unknown>>>>, McpConfigInvalid> =>
  readNativeMcpValues(args).pipe(
    Effect.map((servers) =>
      Object.fromEntries(
        Object.entries(servers).filter((entry): entry is [string, Record<string, unknown>] =>
          isRecord(entry[1]),
        ),
      ),
    ),
  );

/** Read a selected entry through the same complete-file parser for every format. */
export const readNativeMcpEntry = (
  args: NativeMcpConfigRead & { readonly serverName: string },
): Effect.Effect<Option.Option<Readonly<Record<string, unknown>>>, McpConfigInvalid> =>
  readNativeMcpValues(args).pipe(
    Effect.map((values) => {
      const entry = values[args.serverName];
      return isRecord(entry) ? Option.some(entry) : Option.none();
    }),
  );
