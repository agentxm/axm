/**
 * Agent MCP config writer.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { applyEdits, modify } from "jsonc-parser";
import {
  McpConfigInvalid,
  McpConfigIoFailed,
  McpEntryUnmanaged,
  McpOwnershipMarkerInvalid,
  WriteBackupRetained,
  type NativeFormatFailure,
} from "../errors.js";
import { runWithTransientFileBackup } from "../transient-backup.js";
import { NativeWriteAuthority } from "../native-write-authority.js";
import { stringifyToml, stringifyTomlKey } from "../toml.js";
import { deleteYamlEntry, readYamlEntry, setYamlEntry, setYamlScalar } from "../yaml.js";
import { isAxmManagedMcpEntry, readAxmMcpMetadata } from "./entry-semantics.js";
import {
  decodeJsonMcpConfig,
  parseTomlMcpEntry,
  readNativeMcpConfig,
  resolveAgentMcpConfigTargetPath,
} from "./native-config.js";
import type {
  McpActivationField,
  McpConfigTarget,
  McpServersKey,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import type { NativeArtifactChange } from "../agents/coding-agent.js";
import { reconcileKeyedBlock } from "../managed-regions-keyed-block.js";

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

/** One native MCP declaration discovered for conversion into a package. */
export interface AgentMcpConfigEntryRef {
  readonly filePath: string;
  readonly serversKey: McpServersKey;
  readonly name: string;
  readonly target: McpConfigTarget;
}

export interface RetireAgentMcpConfigArgs {
  readonly workspaceRoot: string;
  readonly serverName: string;
  readonly serversKey: McpServersKey;
  readonly target: McpConfigTarget;
}

export interface AgentMcpConfigWriteTarget {
  readonly path: string;
  readonly change: NativeArtifactChange;
}

export interface AgentMcpConfigWriteResult {
  readonly targets: ReadonlyArray<AgentMcpConfigWriteTarget>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const JSON_FORMATTING = { insertSpaces: true, tabSize: 2, eol: "\n" } as const;

const writeIfChanged = (
  configPath: string,
  targetPath: string,
  oldRaw: string,
  newRaw: string,
): Effect.Effect<
  AgentMcpConfigWriteResult,
  NativeFormatFailure,
  FileSystem.FileSystem | Path.Path | NativeWriteAuthority
> =>
  Effect.gen(function* () {
    if (oldRaw === newRaw) return { targets: [] };
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const authority = yield* NativeWriteAuthority;
    yield* authority.protect(configPath);
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
    yield* authority.record({
      path: configPath,
      change: oldRaw === "" ? "created" : "modified",
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

const upsertJsonLike = (args: {
  readonly configPath: string;
  readonly raw: string;
  readonly serversKey: string;
  readonly serverName: string;
  readonly entry: Readonly<Record<string, unknown>>;
}): Effect.Effect<string, McpConfigInvalid> =>
  Effect.gen(function* () {
    const initial = args.raw.trim().length === 0 ? "{}\n" : args.raw;
    yield* decodeJsonMcpConfig(args.configPath, initial, args.serversKey);
    const edits = modify(initial, [args.serversKey, args.serverName], args.entry, {
      formattingOptions: JSON_FORMATTING,
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
    const { servers } = yield* decodeJsonMcpConfig(args.configPath, args.raw, args.serversKey);
    const existing = servers?.[args.serverName];
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
          formattingOptions: JSON_FORMATTING,
        }),
      );
    }
    return applyEdits(
      args.raw,
      modify(args.raw, [args.serversKey, args.serverName], undefined, {
        formattingOptions: JSON_FORMATTING,
      }),
    );
  });

const retireJsonLike = (args: {
  readonly configPath: string;
  readonly raw: string;
  readonly serversKey: string;
  readonly serverName: string;
}): Effect.Effect<string, McpConfigInvalid> =>
  Effect.gen(function* () {
    const { servers } = yield* decodeJsonMcpConfig(args.configPath, args.raw, args.serversKey);
    if (servers?.[args.serverName] === undefined) return args.raw;
    return applyEdits(
      args.raw,
      modify(args.raw, [args.serversKey, args.serverName], undefined, {
        formattingOptions: JSON_FORMATTING,
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

const retireYaml = (args: {
  readonly configPath: string;
  readonly raw: string;
  readonly serversKey: string;
  readonly serverName: string;
}): Effect.Effect<string, McpConfigInvalid> =>
  Effect.try({
    try: () =>
      readYamlEntry(args.raw, args.serversKey, args.serverName) === undefined
        ? args.raw
        : deleteYamlEntry(args.raw, args.serversKey, args.serverName),
    catch: (error) => mapYamlError(args.configPath, error),
  });

const tomlRegion = (serverName: string) => `mcp-server:${serverName}` as const;

/** The owner a TOML fence names: the entry's own AXM ownership record. */
const tomlOwner = (
  serverName: string,
  entry: Readonly<Record<string, unknown>>,
): Effect.Effect<string, McpConfigInvalid> =>
  Option.match(readAxmMcpMetadata(entry), {
    onNone: () =>
      Effect.fail(
        new McpConfigInvalid({
          detail: `MCP entry ${serverName} carries no AXM ownership metadata to fence with`,
        }),
      ),
    onSome: (metadata) => Effect.succeed(metadata.ext),
  });

const invalidTomlRegion = (serverName: string, state: "malformed" | "unsupported-version") =>
  new McpOwnershipMarkerInvalid({ serverName, state, operation: "modify" });

const upsertToml = (args: {
  readonly raw: string;
  readonly serversKey: string;
  readonly serverName: string;
  readonly entry: Readonly<Record<string, unknown>>;
}): Effect.Effect<string, McpOwnershipMarkerInvalid | McpConfigInvalid> =>
  Effect.gen(function* () {
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
      owner: yield* tomlOwner(args.serverName, args.entry),
      rendered: block,
    });
    return reconciliation.state.state === "malformed" ||
      reconciliation.state.state === "unsupported-version"
      ? yield* invalidTomlRegion(args.serverName, reconciliation.state.state)
      : reconciliation.updated;
  });

const removeToml = (args: {
  readonly raw: string;
  readonly serversKey: string;
  readonly serverName: string;
  readonly disableOnly: boolean;
  readonly activationField: McpActivationField;
}): Effect.Effect<string, McpOwnershipMarkerInvalid> => {
  const region = tomlRegion(args.serverName);
  const inspected = reconcileKeyedBlock({
    content: args.raw,
    region,
    owner: "",
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
    // The block keeps the owner it already names; the fenced entry's own
    // ownership record is the fallback when the marker carries none.
    const owner =
      inspected.state.startMarker.ext ??
      Option.getOrUndefined(
        readAxmMcpMetadata(
          parseTomlMcpEntry(inspected.state.body, args.serversKey, args.serverName),
        ),
      )?.ext ??
      region;
    return Effect.succeed(
      reconcileKeyedBlock({ content: args.raw, region, owner, rendered }).updated,
    );
  }
  return Effect.succeed(inspected.updated);
};

const pickProjectTarget = (
  targets: ReadonlyArray<McpConfigTarget>,
): Option.Option<McpConfigTarget> =>
  Option.fromUndefinedOr(targets.find((target) => target.scope === "project"));

const readExisting = (
  configPath: string,
): Effect.Effect<string, McpConfigIoFailed, FileSystem.FileSystem> =>
  readNativeMcpConfig(configPath).pipe(Effect.map(Option.getOrElse(() => "")));

export const writeAgentMcpConfig = (
  args: WriteAgentMcpConfigArgs,
): Effect.Effect<
  AgentMcpConfigWriteResult,
  NativeFormatFailure,
  FileSystem.FileSystem | Path.Path | NativeWriteAuthority
> =>
  Effect.gen(function* () {
    const target = Option.getOrElse(pickProjectTarget([args.target]), () => args.target);
    const configPath = yield* resolveAgentMcpConfigTargetPath(args.workspaceRoot, target);
    const authority = yield* NativeWriteAuthority;
    return yield* authority.withExclusiveWrite(
      configPath,
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
  NativeFormatFailure,
  FileSystem.FileSystem | Path.Path | NativeWriteAuthority
> =>
  Effect.gen(function* () {
    const target = Option.getOrElse(pickProjectTarget([args.target]), () => args.target);
    const configPath = yield* resolveAgentMcpConfigTargetPath(args.workspaceRoot, target);
    const authority = yield* NativeWriteAuthority;
    return yield* authority.withExclusiveWrite(
      configPath,
      Effect.gen(function* () {
        const raw = yield* readExisting(configPath);
        const next = yield* Effect.gen(function* () {
          switch (target.format) {
            case "toml":
              return yield* removeToml({
                raw,
                serversKey: args.serversKey,
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

/** Retire a converted declaration regardless of ownership, preserving its native file. */
export const retireAgentMcpConfig = (
  args: RetireAgentMcpConfigArgs,
): Effect.Effect<
  AgentMcpConfigWriteResult,
  NativeFormatFailure,
  FileSystem.FileSystem | Path.Path | NativeWriteAuthority
> =>
  Effect.gen(function* () {
    const configPath = yield* resolveAgentMcpConfigTargetPath(args.workspaceRoot, args.target);
    const authority = yield* NativeWriteAuthority;
    return yield* authority.withExclusiveWrite(
      configPath,
      Effect.gen(function* () {
        const raw = yield* readExisting(configPath);
        if (raw.length === 0) return { targets: [] };
        const next = yield* Effect.gen(function* () {
          switch (args.target.format) {
            case "toml":
              return yield* new McpConfigInvalid({
                detail: "TOML MCP entries are fenced regions and are not retired in place",
              });
            case "yaml":
              return yield* retireYaml({
                configPath,
                raw,
                serversKey: args.serversKey,
                serverName: args.serverName,
              });
            case "json":
            case "jsonc":
            case "starlark":
            case "vscode-settings":
              return yield* retireJsonLike({
                configPath,
                raw,
                serversKey: args.serversKey,
                serverName: args.serverName,
              });
          }
        });
        return yield* writeIfChanged(configPath, args.target.path, raw, next);
      }),
    );
  });
