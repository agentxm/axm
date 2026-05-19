/**
 * Agent MCP config writer.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { applyEdits, modify, parse, type ParseError } from "jsonc-parser";
import { makeAppError, type AppError } from "../app-error/index.js";
import { getHome } from "../agents/constants.js";
import { isPathSafe } from "../utils/index.js";
import { stringifyToml } from "../toml/index.js";
import type { McpConfigTarget, McpServersKey } from "../agent-capabilities/index.js";

export interface WriteAgentMcpConfigArgs {
  readonly workspaceRoot: string;
  readonly serverName: string;
  readonly serversKey: McpServersKey;
  readonly target: McpConfigTarget;
  readonly entry: Readonly<Record<string, unknown>>;
}

export interface RemoveAgentMcpConfigArgs {
  readonly workspaceRoot: string;
  readonly serverName: string;
  readonly serversKey: McpServersKey;
  readonly target: McpConfigTarget;
  readonly nativeEnabled: boolean;
  readonly disableOnly: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseJsonConfig = (configPath: string, raw: string): Effect.Effect<unknown, AppError> =>
  Effect.sync(() => {
    const errors: Array<ParseError> = [];
    const parsed: unknown = parse(raw, errors, { allowTrailingComma: true });
    if (errors.length > 0) {
      throw errors;
    }
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

const formatPath = (path: ReadonlyArray<string>) => path.join(".");

const validateServersShape = (
  configPath: string,
  parsed: unknown,
  serversKey: string,
): Effect.Effect<void, AppError> => {
  if (!isRecord(parsed)) {
    return Effect.fail(
      makeAppError({
        code: "validation",
        detail: `Invalid MCP config format: ${configPath}`,
      }),
    );
  }
  const servers = parsed[serversKey];
  if (servers !== undefined && !isRecord(servers)) {
    return Effect.fail(
      makeAppError({
        code: "validation",
        detail: `Invalid MCP config format: ${configPath} (${formatPath([serversKey])} must be an object)`,
      }),
    );
  }
  return Effect.void;
};

const makeBackup = (
  configPath: string,
  oldRaw: string,
  newRaw: string,
): Effect.Effect<void, AppError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    if (oldRaw === "" || oldRaw === newRaw) return;
    const fs = yield* FileSystem.FileSystem;
    yield* fs.writeFileString(`${configPath}.bak`, oldRaw).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to write backup: ${configPath}.bak`,
          cause: error,
        }),
      ),
    );
  });

const readExisting = (configPath: string): Effect.Effect<string, AppError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(configPath).pipe(Effect.catch(() => Effect.succeed(false)));
    if (!exists) return "";
    return yield* fs.readFileString(configPath).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to read MCP config: ${configPath}`,
          cause: error,
        }),
      ),
    );
  });

const writeIfChanged = (
  configPath: string,
  oldRaw: string,
  newRaw: string,
): Effect.Effect<void, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    if (oldRaw === newRaw) return;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.makeDirectory(path.dirname(configPath), { recursive: true }).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to create config directory: ${path.dirname(configPath)}`,
          cause: error,
        }),
      ),
    );
    yield* makeBackup(configPath, oldRaw, newRaw);
    yield* fs.writeFileString(configPath, newRaw).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to write MCP config: ${configPath}`,
          cause: error,
        }),
      ),
    );
  });

const resolveTargetPath = (
  workspaceRoot: string,
  target: McpConfigTarget,
): Effect.Effect<string, AppError, Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const home = yield* getHome;
    const base =
      target.scope === "user"
        ? target.path.startsWith("~/")
          ? path.join(home, target.path.slice(2))
          : path.resolve(home, target.path)
        : path.resolve(workspaceRoot, target.path);

    if (target.scope === "project" && !isPathSafe(workspaceRoot, base)) {
      return yield* makeAppError({
        code: "validation",
        detail: `MCP config target escapes workspace root: ${target.path}`,
      });
    }
    return base;
  });

const upsertJsonLike = (args: {
  readonly configPath: string;
  readonly raw: string;
  readonly serversKey: string;
  readonly serverName: string;
  readonly entry: Readonly<Record<string, unknown>>;
}): Effect.Effect<string, AppError> =>
  Effect.gen(function* () {
    const initial = args.raw.trim().length === 0 ? "{}\n" : args.raw;
    const parsed = yield* parseJsonConfig(args.configPath, initial);
    yield* validateServersShape(args.configPath, parsed, args.serversKey);
    const edits = modify(initial, [args.serversKey, args.serverName], args.entry, {
      formattingOptions: { insertSpaces: true, tabSize: 2, eol: "\n" },
    });
    return applyEdits(initial, edits);
  });

const removeJsonLike = (args: {
  readonly configPath: string;
  readonly raw: string;
  readonly serversKey: string;
  readonly serverName: string;
  readonly nativeEnabled: boolean;
  readonly disableOnly: boolean;
}): Effect.Effect<string, AppError> =>
  Effect.gen(function* () {
    if (args.raw.trim().length === 0) return args.raw;
    const parsed = yield* parseJsonConfig(args.configPath, args.raw);
    yield* validateServersShape(args.configPath, parsed, args.serversKey);
    if (args.disableOnly && args.nativeEnabled) {
      return applyEdits(
        args.raw,
        modify(args.raw, [args.serversKey, args.serverName, "enabled"], false, {
          formattingOptions: { insertSpaces: true, tabSize: 2, eol: "\n" },
        }),
      );
    }
    return applyEdits(
      args.raw,
      modify(args.raw, [args.serversKey, args.serverName], undefined, {
        formattingOptions: { insertSpaces: true, tabSize: 2, eol: "\n" },
      }),
    );
  });

const managedTomlStart = (serverName: string): string =>
  `# axm managed mcp-server ${serverName} start`;

const managedTomlEnd = (serverName: string): string => `# axm managed mcp-server ${serverName} end`;

const stripManagedTomlBlock = (raw: string, serverName: string): string => {
  const start = managedTomlStart(serverName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const end = managedTomlEnd(serverName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return raw.replace(new RegExp(`\\n?${start}[\\s\\S]*?${end}\\n?`, "g"), "\n").trimEnd();
};

const upsertToml = (args: {
  readonly raw: string;
  readonly serversKey: string;
  readonly serverName: string;
  readonly entry: Readonly<Record<string, unknown>>;
}): string => {
  const trimmed = stripManagedTomlBlock(args.raw, args.serverName);
  const block = stringifyToml({
    [args.serversKey]: {
      [args.serverName]: args.entry,
    },
  });
  const prefix = trimmed.length > 0 ? `${trimmed}\n\n` : "";
  return `${prefix}${managedTomlStart(args.serverName)}\n${block}\n${managedTomlEnd(args.serverName)}\n`;
};

const removeToml = (args: {
  readonly raw: string;
  readonly serverName: string;
  readonly disableOnly: boolean;
  readonly nativeEnabled: boolean;
}): string => {
  if (args.disableOnly && args.nativeEnabled) {
    return args.raw.replace(/^enabled = true$/m, "enabled = false");
  }
  const stripped = stripManagedTomlBlock(args.raw, args.serverName);
  return stripped.length > 0 ? `${stripped}\n` : "";
};

const pickProjectTarget = (
  targets: ReadonlyArray<McpConfigTarget>,
): Option.Option<McpConfigTarget> =>
  Option.fromUndefinedOr(targets.find((target) => target.scope === "project"));

export const writeAgentMcpConfig = (
  args: WriteAgentMcpConfigArgs,
): Effect.Effect<void, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const target = Option.getOrElse(pickProjectTarget([args.target]), () => args.target);
    const configPath = yield* resolveTargetPath(args.workspaceRoot, target);
    const raw = yield* readExisting(configPath);
    const next =
      target.format === "toml"
        ? upsertToml({
            raw,
            serversKey: args.serversKey,
            serverName: args.serverName,
            entry: args.entry,
          })
        : yield* upsertJsonLike({
            configPath,
            raw,
            serversKey: args.serversKey,
            serverName: args.serverName,
            entry: args.entry,
          });
    yield* writeIfChanged(configPath, raw, next);
  });

export const removeAgentMcpConfig = (
  args: RemoveAgentMcpConfigArgs,
): Effect.Effect<void, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const target = Option.getOrElse(pickProjectTarget([args.target]), () => args.target);
    const configPath = yield* resolveTargetPath(args.workspaceRoot, target);
    const raw = yield* readExisting(configPath);
    const next =
      target.format === "toml"
        ? removeToml({
            raw,
            serverName: args.serverName,
            disableOnly: args.disableOnly,
            nativeEnabled: args.nativeEnabled,
          })
        : yield* removeJsonLike({
            configPath,
            raw,
            serversKey: args.serversKey,
            serverName: args.serverName,
            nativeEnabled: args.nativeEnabled,
            disableOnly: args.disableOnly,
          });
    yield* writeIfChanged(configPath, raw, next);
  });
