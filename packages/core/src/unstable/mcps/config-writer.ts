/**
 * Agent MCP config writer.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Semaphore from "effect/Semaphore";
import { applyEdits, modify, parse, type ParseError } from "jsonc-parser";
import { makeAppError, type AppError } from "../app-error/index.js";
import { getHome } from "../agents/constants.js";
import { isPathSafe } from "../utils/index.js";
import { runWithTransientFileBackup } from "../utils/transient-backup.js";
import { stringifyToml, stringifyTomlKey } from "../toml/index.js";
import { deleteYamlEntry, setYamlEntry, setYamlScalar } from "../yaml/index.js";
import type {
  McpActivationField,
  McpConfigTarget,
  McpServersKey,
} from "../agent-capabilities/index.js";
import type { ArtifactChange } from "../plan/plan.js";

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
  readonly activationField: McpActivationField;
  readonly disableOnly: boolean;
}

export interface AgentMcpConfigWriteTarget {
  readonly path: string;
  readonly change: ArtifactChange;
}

export interface AgentMcpConfigWriteResult {
  readonly targets: ReadonlyArray<AgentMcpConfigWriteTarget>;
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
  targetPath: string,
  oldRaw: string,
  newRaw: string,
): Effect.Effect<AgentMcpConfigWriteResult, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    if (oldRaw === newRaw) return { targets: [] };
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
    yield* runWithTransientFileBackup({
      sourcePath: configPath,
      oldRaw,
      newRaw,
      tempPrefix: "axm-mcp-config-backup-",
      operation: fs.writeFileString(configPath, newRaw).pipe(
        Effect.mapError((error) =>
          makeAppError({
            code: "internal",
            detail: `Failed to write MCP config: ${configPath}`,
            cause: error,
          }),
        ),
      ),
    });
    return {
      targets: [
        {
          path: targetPath,
          change: oldRaw === "" ? "created" : "updated",
        },
      ],
    };
  });

export const resolveAgentMcpConfigTargetPath = (
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
  readonly activationField: McpActivationField;
  readonly disableOnly: boolean;
}): Effect.Effect<string, AppError> =>
  Effect.gen(function* () {
    if (args.raw.trim().length === 0) return args.raw;
    const parsed = yield* parseJsonConfig(args.configPath, args.raw);
    yield* validateServersShape(args.configPath, parsed, args.serversKey);
    const activation = args.activationField.required;
    if (args.disableOnly && activation !== null) {
      return applyEdits(
        args.raw,
        modify(args.raw, [args.serversKey, args.serverName, activation.name], activation.disabled, {
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

const mapYamlError = (configPath: string, error: unknown): AppError =>
  makeAppError({
    code: "validation",
    detail: `Invalid MCP config YAML: ${configPath}`,
    cause: error,
  });

const upsertYaml = (args: {
  readonly configPath: string;
  readonly raw: string;
  readonly serversKey: string;
  readonly serverName: string;
  readonly entry: Readonly<Record<string, unknown>>;
}): Effect.Effect<string, AppError> =>
  Effect.sync(() => setYamlEntry(args.raw, args.serversKey, args.serverName, args.entry)).pipe(
    Effect.mapError((error) => mapYamlError(args.configPath, error)),
  );

const removeYaml = (args: {
  readonly configPath: string;
  readonly raw: string;
  readonly serversKey: string;
  readonly serverName: string;
  readonly activationField: McpActivationField;
  readonly disableOnly: boolean;
}): Effect.Effect<string, AppError> =>
  Effect.sync(() => {
    if (args.raw.trim().length === 0) return args.raw;
    const activation = args.activationField.required;
    if (args.disableOnly && activation !== null) {
      return setYamlScalar(
        args.raw,
        [args.serversKey, args.serverName, activation.name],
        activation.disabled,
      );
    }
    return deleteYamlEntry(args.raw, args.serversKey, args.serverName);
  }).pipe(Effect.mapError((error) => mapYamlError(args.configPath, error)));

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
  const parentHeader = `[${stringifyTomlKey(args.serversKey)}]`;
  const block = stringifyToml({
    [args.serversKey]: { [args.serverName]: args.entry },
  })
    .split("\n")
    .filter((line) => line !== parentHeader)
    .join("\n")
    .trim();
  const prefix = trimmed.length > 0 ? `${trimmed}\n\n` : "";
  return `${prefix}${managedTomlStart(args.serverName)}\n${block}\n${managedTomlEnd(args.serverName)}\n`;
};

const removeToml = (args: {
  readonly raw: string;
  readonly serverName: string;
  readonly disableOnly: boolean;
  readonly activationField: McpActivationField;
}): string => {
  const activation = args.activationField.required;
  if (args.disableOnly && activation !== null) {
    const start = managedTomlStart(args.serverName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const end = managedTomlEnd(args.serverName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const field = activation.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return args.raw.replace(new RegExp(`${start}[\\s\\S]*?${end}`), (block) =>
      block.replace(
        new RegExp(`^${field} = (?:true|false)$`, "m"),
        `${activation.name} = ${String(activation.disabled)}`,
      ),
    );
  }
  const stripped = stripManagedTomlBlock(args.raw, args.serverName);
  return stripped.length > 0 ? `${stripped}\n` : "";
};

const pickProjectTarget = (
  targets: ReadonlyArray<McpConfigTarget>,
): Option.Option<McpConfigTarget> =>
  Option.fromUndefinedOr(targets.find((target) => target.scope === "project"));

// Serializes concurrent read-modify-write access to a single agent MCP config
// file within a process, so parallel sync steps writing different servers to the
// same file cannot clobber each other's entries (last-write-wins data loss).
const configWriteLocks = new Map<string, Semaphore.Semaphore>();
const configWriteLockFor = (configPath: string): Semaphore.Semaphore => {
  const existing = configWriteLocks.get(configPath);
  if (existing !== undefined) return existing;
  const created = Semaphore.makeUnsafe(1);
  configWriteLocks.set(configPath, created);
  return created;
};

export const writeAgentMcpConfig = (
  args: WriteAgentMcpConfigArgs,
): Effect.Effect<AgentMcpConfigWriteResult, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const target = Option.getOrElse(pickProjectTarget([args.target]), () => args.target);
    const configPath = yield* resolveAgentMcpConfigTargetPath(args.workspaceRoot, target);
    return yield* configWriteLockFor(configPath).withPermits(1)(
      Effect.gen(function* () {
        const raw = yield* readExisting(configPath);
        const next = yield* Effect.gen(function* () {
          switch (target.format) {
            case "toml":
              return upsertToml({
                raw,
                serversKey: args.serversKey,
                serverName: args.serverName,
                entry: args.entry,
              });
            case "yaml":
              return yield* upsertYaml({
                configPath,
                raw,
                serversKey: args.serversKey,
                serverName: args.serverName,
                entry: args.entry,
              });
            case "json":
            case "jsonc":
            case "starlark":
            case "vscode-settings":
              return yield* upsertJsonLike({
                configPath,
                raw,
                serversKey: args.serversKey,
                serverName: args.serverName,
                entry: args.entry,
              });
          }
        });
        return yield* writeIfChanged(configPath, target.path, raw, next);
      }),
    );
  });

export const removeAgentMcpConfig = (
  args: RemoveAgentMcpConfigArgs,
): Effect.Effect<AgentMcpConfigWriteResult, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const target = Option.getOrElse(pickProjectTarget([args.target]), () => args.target);
    const configPath = yield* resolveAgentMcpConfigTargetPath(args.workspaceRoot, target);
    return yield* configWriteLockFor(configPath).withPermits(1)(
      Effect.gen(function* () {
        const raw = yield* readExisting(configPath);
        const next = yield* Effect.gen(function* () {
          switch (target.format) {
            case "toml":
              return removeToml({
                raw,
                serverName: args.serverName,
                disableOnly: args.disableOnly,
                activationField: args.activationField,
              });
            case "yaml":
              return yield* removeYaml({
                configPath,
                raw,
                serversKey: args.serversKey,
                serverName: args.serverName,
                activationField: args.activationField,
                disableOnly: args.disableOnly,
              });
            case "json":
            case "jsonc":
            case "starlark":
            case "vscode-settings":
              return yield* removeJsonLike({
                configPath,
                raw,
                serversKey: args.serversKey,
                serverName: args.serverName,
                activationField: args.activationField,
                disableOnly: args.disableOnly,
              });
          }
        });
        return yield* writeIfChanged(configPath, target.path, raw, next);
      }),
    );
  });
