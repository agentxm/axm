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
import {
  McpConfigInvalid,
  McpConfigIoFailed,
  McpEntryUnmanaged,
  McpOwnershipMarkerInvalid,
} from "./errors.js";
import {
  WriteBackupRetained,
  type ExtensionManagerFailure,
} from "../extension-workspace/errors.js";
import { getHome } from "../utils/environment.js";
import { isPathSafe } from "@agentxm/workspace-state";
import { runWithTransientFileBackup } from "../utils/transient-backup.js";
import { protectWorkspacePath } from "@agentxm/workspace-state";
import { stringifyToml, stringifyTomlKey } from "../toml/index.js";
import { deleteYamlEntry, readYamlEntry, setYamlEntry, setYamlScalar } from "../yaml/index.js";
import { isAxmManagedMcpEntry } from "@agentxm/workspace-state";
import type {
  McpActivationField,
  McpConfigTarget,
  McpServersKey,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import type { ArtifactChange } from "@agentxm/workspace-state";
import { reconcileKeyedBlock } from "../projection/adapters.js";

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

const parseJsonConfig = (
  configPath: string,
  raw: string,
): Effect.Effect<unknown, McpConfigInvalid> =>
  Effect.try({
    try: () => {
      const errors: Array<ParseError> = [];
      const parsed: unknown = parse(raw, errors, { allowTrailingComma: true });
      if (errors.length > 0) {
        throw errors;
      }
      return parsed;
    },
    catch: (error) =>
      new McpConfigInvalid({
        detail: `Invalid MCP config JSON/JSONC: ${configPath}`,
        cause: error,
      }),
  });

const formatPath = (path: ReadonlyArray<string>) => path.join(".");

const validateServersShape = (
  configPath: string,
  parsed: unknown,
  serversKey: string,
): Effect.Effect<void, McpConfigInvalid> => {
  if (!isRecord(parsed)) {
    return Effect.fail(
      new McpConfigInvalid({ detail: `Invalid MCP config format: ${configPath}` }),
    );
  }
  const servers = parsed[serversKey];
  if (servers !== undefined && !isRecord(servers)) {
    return Effect.fail(
      new McpConfigInvalid({
        detail: `Invalid MCP config format: ${configPath} (${formatPath([serversKey])} must be an object)`,
      }),
    );
  }
  return Effect.void;
};

const readExisting = (
  configPath: string,
): Effect.Effect<string, McpConfigIoFailed, FileSystem.FileSystem> =>
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
    if (!exists) return "";
    return yield* fs
      .readFileString(configPath)
      .pipe(
        Effect.mapError(
          (cause) =>
            new McpConfigIoFailed({ detail: `Failed to read MCP config: ${configPath}`, cause }),
        ),
      );
  });

const writeIfChanged = (
  configPath: string,
  targetPath: string,
  oldRaw: string,
  newRaw: string,
): Effect.Effect<
  AgentMcpConfigWriteResult,
  ExtensionManagerFailure,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    if (oldRaw === newRaw) return { targets: [] };
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* protectWorkspacePath(configPath);
    yield* fs.makeDirectory(path.dirname(configPath), { recursive: true }).pipe(
      Effect.mapError(
        (cause) =>
          new McpConfigIoFailed({
            detail: `Failed to create config directory: ${path.dirname(configPath)}`,
            cause,
          }),
      ),
    );
    yield* runWithTransientFileBackup({
      sourcePath: configPath,
      oldRaw,
      newRaw,
      tempPrefix: "axm-mcp-config-backup-",
      operation: fs.writeFileString(configPath, newRaw).pipe(
        Effect.mapError(
          (cause) =>
            new McpConfigIoFailed({
              detail: `Failed to write MCP config: ${configPath}`,
              cause,
            }),
        ),
      ),
      onBackupRetained: (error, backupPath) =>
        new WriteBackupRetained({ backupPath, failure: error }),
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

const upsertJsonLike = (args: {
  readonly configPath: string;
  readonly raw: string;
  readonly serversKey: string;
  readonly serverName: string;
  readonly entry: Readonly<Record<string, unknown>>;
}): Effect.Effect<string, McpConfigInvalid> =>
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
}): Effect.Effect<string, McpConfigInvalid | McpEntryUnmanaged> =>
  Effect.gen(function* () {
    if (args.raw.trim().length === 0) return args.raw;
    const parsed = yield* parseJsonConfig(args.configPath, args.raw);
    yield* validateServersShape(args.configPath, parsed, args.serversKey);
    if (!isRecord(parsed)) return args.raw;
    const servers = parsed[args.serversKey];
    const existing = isRecord(servers) ? servers[args.serverName] : undefined;
    if (existing === undefined) return args.raw;
    if (!isRecord(existing) || !isAxmManagedMcpEntry(existing)) {
      return yield* new McpEntryUnmanaged({
        serverName: args.serverName,
        configPath: args.configPath,
      });
    }
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

const mapYamlError = (configPath: string, error: unknown): McpConfigInvalid =>
  new McpConfigInvalid({
    detail: `Invalid MCP config YAML: ${configPath}`,
    cause: error,
  });

const upsertYaml = (args: {
  readonly configPath: string;
  readonly raw: string;
  readonly serversKey: string;
  readonly serverName: string;
  readonly entry: Readonly<Record<string, unknown>>;
}): Effect.Effect<string, McpConfigInvalid> =>
  Effect.try({
    try: () => setYamlEntry(args.raw, args.serversKey, args.serverName, args.entry),
    catch: (error) => mapYamlError(args.configPath, error),
  });

const removeYaml = (args: {
  readonly configPath: string;
  readonly raw: string;
  readonly serversKey: string;
  readonly serverName: string;
  readonly activationField: McpActivationField;
  readonly disableOnly: boolean;
}): Effect.Effect<string, McpConfigInvalid | McpEntryUnmanaged> =>
  Effect.try({
    try: () => {
      if (args.raw.trim().length === 0) return args.raw;
      const existing = readYamlEntry(args.raw, args.serversKey, args.serverName);
      if (existing === undefined) return args.raw;
      if (!isAxmManagedMcpEntry(existing)) {
        throw new McpEntryUnmanaged({
          serverName: args.serverName,
          configPath: args.configPath,
        });
      }
      const activation = args.activationField.required;
      if (args.disableOnly && activation !== null) {
        return setYamlScalar(
          args.raw,
          [args.serversKey, args.serverName, activation.name],
          activation.disabled,
        );
      }
      return deleteYamlEntry(args.raw, args.serversKey, args.serverName);
    },
    catch: (error) =>
      error instanceof McpEntryUnmanaged ? error : mapYamlError(args.configPath, error),
  });

const tomlRegion = (serverName: string) => `mcp-server:${serverName}` as const;

const tomlOwner = (serverName: string, entry?: Readonly<Record<string, unknown>>): string => {
  const metadata = entry?.["x-axm"];
  return isRecord(metadata) && typeof metadata["ref"] === "string"
    ? metadata["ref"]
    : `@agentxm/mcps/${serverName}`;
};

const invalidTomlRegion = (serverName: string, state: "malformed" | "unsupported-version") =>
  new McpOwnershipMarkerInvalid({ serverName, state, operation: "modify" });

const upsertToml = (args: {
  readonly raw: string;
  readonly serversKey: string;
  readonly serverName: string;
  readonly entry: Readonly<Record<string, unknown>>;
}): Effect.Effect<string, McpOwnershipMarkerInvalid> => {
  const parentHeader = `[${stringifyTomlKey(args.serversKey)}]`;
  const block = stringifyToml({
    [args.serversKey]: { [args.serverName]: args.entry },
  })
    .split("\n")
    .filter((line) => line !== parentHeader)
    .join("\n")
    .trim();
  const reconciliation = reconcileKeyedBlock({
    content: args.raw,
    region: tomlRegion(args.serverName),
    owner: tomlOwner(args.serverName, args.entry),
    rendered: block,
  });
  return reconciliation.state.state === "malformed" ||
    reconciliation.state.state === "unsupported-version"
    ? Effect.fail(invalidTomlRegion(args.serverName, reconciliation.state.state))
    : Effect.succeed(reconciliation.updated);
};

const removeToml = (args: {
  readonly raw: string;
  readonly serverName: string;
  readonly disableOnly: boolean;
  readonly activationField: McpActivationField;
}): Effect.Effect<string, McpOwnershipMarkerInvalid> => {
  const inspected = reconcileKeyedBlock({
    content: args.raw,
    region: tomlRegion(args.serverName),
    owner: tomlOwner(args.serverName),
    rendered: "",
  });
  if (inspected.state.state === "malformed" || inspected.state.state === "unsupported-version") {
    return Effect.fail(invalidTomlRegion(args.serverName, inspected.state.state));
  }
  if (inspected.state.state === "absent") return Effect.succeed(args.raw);
  const activation = args.activationField.required;
  if (args.disableOnly && activation !== null) {
    const field = activation.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rendered = inspected.state.body.replace(
      new RegExp(`^${field} = (?:true|false)$`, "m"),
      `${activation.name} = ${String(activation.disabled)}`,
    );
    return Effect.succeed(
      reconcileKeyedBlock({
        content: args.raw,
        region: tomlRegion(args.serverName),
        owner: inspected.state.startMarker.ext ?? tomlOwner(args.serverName),
        rendered,
      }).updated,
    );
  }
  return Effect.succeed(inspected.updated);
};

const pickProjectTarget = (
  targets: ReadonlyArray<McpConfigTarget>,
): Option.Option<McpConfigTarget> =>
  Option.fromUndefinedOr(targets.find((target) => target.scope === "project"));

// Serializes concurrent read-modify-write access to a single agent MCP config
// file within a process, so parallel sync steps writing different servers to the
// same file cannot clobber each other's entries (last-write-wins data loss).
// eslint-disable-next-line no-restricted-syntax -- Process-owned keys are bounded by MCP config paths touched during this one CLI invocation.
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
): Effect.Effect<
  AgentMcpConfigWriteResult,
  ExtensionManagerFailure,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const target = Option.getOrElse(pickProjectTarget([args.target]), () => args.target);
    const configPath = yield* resolveAgentMcpConfigTargetPath(args.workspaceRoot, target);
    return yield* configWriteLockFor(configPath).withPermits(1)(
      Effect.gen(function* () {
        const raw = yield* readExisting(configPath);
        const next = yield* Effect.gen(function* () {
          switch (target.format) {
            case "toml":
              return yield* upsertToml({
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
): Effect.Effect<
  AgentMcpConfigWriteResult,
  ExtensionManagerFailure,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const target = Option.getOrElse(pickProjectTarget([args.target]), () => args.target);
    const configPath = yield* resolveAgentMcpConfigTargetPath(args.workspaceRoot, target);
    return yield* configWriteLockFor(configPath).withPermits(1)(
      Effect.gen(function* () {
        const raw = yield* readExisting(configPath);
        const next = yield* Effect.gen(function* () {
          switch (target.format) {
            case "toml":
              return yield* removeToml({
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
