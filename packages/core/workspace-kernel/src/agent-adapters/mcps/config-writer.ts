/**
 * Agent MCP config writer.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Equal from "effect/Equal";
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
import { detachNativeTomlMcpEntry } from "./toml-adoption.js";
import { deleteYamlEntry, readYamlEntry, setYamlEntry, setYamlScalar } from "../yaml.js";
import {
  isAxmManagedMcpEntry,
  readAxmMcpMetadata,
  type AxmMcpMetadata,
} from "./entry-semantics.js";
import {
  decodeJsonMcpConfig,
  parseTomlMcpEntry,
  readNativeMcpConfig,
  readNativeMcpDocument,
  readNativeMcpValues,
  resolveAgentMcpConfigTargetPath,
} from "./native-config.js";
import type {
  McpActivationField,
  McpConfigTarget,
  McpServersPath,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import type { NativeArtifactChange } from "../agents/coding-agent.js";
import { reconcileKeyedBlock } from "../managed-regions-keyed-block.js";
import { deriveStructuralInverse, type NativeLocationOutcome } from "../../locations/index.js";

export interface WriteAgentMcpConfigArgs {
  readonly workspaceRoot: string;
  readonly serverName: string;
  readonly serversPath: McpServersPath;
  readonly target: McpConfigTarget;
  readonly entry: Readonly<Record<string, unknown>>;
  /** The caller proved this operation introduces a previously unreachable intent or route. */
  readonly nativeInsertionEligible: boolean;
  /** Owners derived from the accepted intent before an explicitly requested replacement. */
  readonly previousManagedEntries?: ReadonlyArray<AxmMcpMetadata>;
  readonly aliases?: ReadonlyArray<string>;
  /** Explicit import authority, bound to the exact observed declaration and physical file. */
  readonly adoption?: {
    readonly filePath: string;
    readonly expectedEntry: Readonly<Record<string, unknown>>;
  };
}

export interface RemoveAgentMcpConfigArgs {
  /** Exact owners derived from accepted intent before the withdrawal. */
  readonly expectedManagedEntries: Readonly<Record<string, ReadonlyArray<AxmMcpMetadata>>>;
  readonly aliases?: ReadonlyArray<string>;
  readonly workspaceRoot: string;
  readonly serverName: string;
  readonly serversPath: McpServersPath;
  readonly target: McpConfigTarget;
  readonly activationField: McpActivationField;
  readonly disableOnly: boolean;
}

/** One native MCP declaration discovered for conversion into a package. */
export interface AgentMcpConfigEntryRef {
  readonly filePath: string;
  readonly serversPath: McpServersPath;
  readonly name: string;
  readonly target: McpConfigTarget;
  readonly expectedEntry: Readonly<Record<string, unknown>>;
}

export interface RetireAgentMcpConfigArgs {
  readonly workspaceRoot: string;
  readonly serverName: string;
  readonly serversPath: McpServersPath;
  readonly target: McpConfigTarget;
  readonly adoption: {
    readonly filePath: string;
    readonly expectedEntry: Readonly<Record<string, unknown>>;
  };
}

export interface AgentMcpConfigWriteTarget {
  readonly path: string;
  readonly change: NativeArtifactChange;
  readonly nativeLocation?: NativeLocationOutcome;
}

export interface AgentMcpConfigWriteResult {
  readonly targets: ReadonlyArray<AgentMcpConfigWriteTarget>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const jsonFormatting = (raw: string) => ({
  insertSpaces: true,
  tabSize: 2,
  eol: raw.includes("\r\n") ? "\r\n" : "\n",
});

const writeIfChanged = (
  configPath: string,
  targetPath: string,
  before: Option.Option<string>,
  newRaw: string,
  insertion: {
    readonly unit: string;
    readonly aliases: ReadonlyArray<string>;
    readonly eligible: boolean;
  },
): Effect.Effect<
  AgentMcpConfigWriteResult,
  NativeFormatFailure,
  FileSystem.FileSystem | Path.Path | NativeWriteAuthority
> =>
  Effect.gen(function* () {
    const oldRaw = Option.getOrElse(before, () => "");
    if (oldRaw === newRaw) return { targets: [] };
    const fs = yield* FileSystem.FileSystem;
    const authority = yield* NativeWriteAuthority;
    const capture = yield* authority.captureInsertion({
      path: configPath,
      beforeRaw: before,
      ...insertion,
    });
    yield* authority.protect(configPath);
    const createdDirectories = yield* authority.createParentDirectories(configPath);
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
      change: Option.isNone(before) ? "created" : "modified",
    });
    yield* authority.recordInsertion({ capture, afterRaw: newRaw, createdDirectories });
    return {
      targets: [
        {
          path: targetPath,
          change: Option.isNone(before) ? "created" : "updated",
        },
      ],
    } satisfies AgentMcpConfigWriteResult;
  }).pipe(Effect.uninterruptible);

const upsertJsonLike = (args: {
  readonly configPath: string;
  readonly raw: string;
  readonly serversPath: McpServersPath;
  readonly serverName: string;
  readonly entry: Readonly<Record<string, unknown>>;
  readonly format: McpConfigTarget["format"];
}): Effect.Effect<string, McpConfigInvalid> =>
  Effect.gen(function* () {
    const initial = args.raw.trim().length === 0 ? "{}\n" : args.raw;
    yield* decodeJsonMcpConfig(args.configPath, initial, args.serversPath, args.format);
    const formatted = applyEdits(
      initial,
      modify(initial, [...args.serversPath, args.serverName], args.entry, {
        formattingOptions: jsonFormatting(initial),
      }),
    );
    return Option.isSome(deriveStructuralInverse(initial, formatted))
      ? formatted
      : applyEdits(
          initial,
          modify(initial, [...args.serversPath, args.serverName], args.entry, {}),
        );
  });

const removeJsonLike = (args: {
  readonly configPath: string;
  readonly raw: string;
  readonly serversPath: McpServersPath;
  readonly serverName: string;
  readonly activationField: McpActivationField;
  readonly disableOnly: boolean;
}): Effect.Effect<string, McpConfigInvalid | McpEntryUnmanaged> =>
  Effect.gen(function* () {
    if (args.raw.trim().length === 0) return args.raw;
    const { servers } = yield* decodeJsonMcpConfig(args.configPath, args.raw, args.serversPath);
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
        modify(
          args.raw,
          [...args.serversPath, args.serverName, activation.name],
          activation.disabled,
          {
            formattingOptions: jsonFormatting(args.raw),
          },
        ),
      );
    }
    return applyEdits(
      args.raw,
      modify(args.raw, [...args.serversPath, args.serverName], undefined, {
        formattingOptions: jsonFormatting(args.raw),
      }),
    );
  });

const retireJsonLike = (args: {
  readonly configPath: string;
  readonly raw: string;
  readonly serversPath: McpServersPath;
  readonly serverName: string;
}): Effect.Effect<string, McpConfigInvalid> =>
  Effect.gen(function* () {
    const { servers } = yield* decodeJsonMcpConfig(args.configPath, args.raw, args.serversPath);
    if (servers?.[args.serverName] === undefined) return args.raw;
    return applyEdits(
      args.raw,
      modify(args.raw, [...args.serversPath, args.serverName], undefined, {
        formattingOptions: jsonFormatting(args.raw),
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
  readonly serversPath: McpServersPath;
  readonly serverName: string;
  readonly entry: Readonly<Record<string, unknown>>;
}): Effect.Effect<string, McpConfigInvalid> =>
  Effect.try({
    try: () => setYamlEntry(args.raw, args.serversPath, args.serverName, args.entry),
    catch: (error) => mapYamlError(args.configPath, error),
  });

const removeYaml = (args: {
  readonly configPath: string;
  readonly raw: string;
  readonly serversPath: McpServersPath;
  readonly serverName: string;
  readonly activationField: McpActivationField;
  readonly disableOnly: boolean;
}): Effect.Effect<string, McpConfigInvalid | McpEntryUnmanaged> =>
  Effect.try({
    try: () => {
      if (args.raw.trim().length === 0) return args.raw;
      const existing = readYamlEntry(args.raw, args.serversPath, args.serverName);
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
          [...args.serversPath, args.serverName, activation.name],
          activation.disabled,
        );
      }
      return deleteYamlEntry(args.raw, args.serversPath, args.serverName);
    },
    catch: (error) =>
      error instanceof McpEntryUnmanaged ? error : mapYamlError(args.configPath, error),
  });

const retireYaml = (args: {
  readonly configPath: string;
  readonly raw: string;
  readonly serversPath: McpServersPath;
  readonly serverName: string;
}): Effect.Effect<string, McpConfigInvalid> =>
  Effect.try({
    try: () =>
      readYamlEntry(args.raw, args.serversPath, args.serverName) === undefined
        ? args.raw
        : deleteYamlEntry(args.raw, args.serversPath, args.serverName),
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
  readonly serversPath: McpServersPath;
  readonly serverName: string;
  readonly entry: Readonly<Record<string, unknown>>;
}): Effect.Effect<string, McpOwnershipMarkerInvalid | McpConfigInvalid> =>
  Effect.gen(function* () {
    const parentHeaders = new Set(
      args.serversPath.map(
        (_, index) =>
          `[${args.serversPath
            .slice(0, index + 1)
            .map(stringifyTomlKey)
            .join(".")}]`,
      ),
    );
    const document = args.serversPath.reduceRight<Readonly<Record<string, unknown>>>(
      (nested, key) => Object.fromEntries([[key, nested]]),
      Object.fromEntries([[args.serverName, args.entry]]),
    );
    const block = stringifyToml(document)
      .split("\n")
      .filter((line) => !parentHeaders.has(line))
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
  readonly serversPath: McpServersPath;
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
          parseTomlMcpEntry(inspected.state.body, args.serversPath, args.serverName),
        ),
      )?.ext ??
      region;
    return Effect.succeed(
      reconcileKeyedBlock({ content: args.raw, region, owner, rendered }).updated,
    );
  }
  return Effect.succeed(inspected.updated);
};

const readExisting = (
  configPath: string,
): Effect.Effect<string, McpConfigIoFailed, FileSystem.FileSystem> =>
  readNativeMcpConfig(configPath).pipe(Effect.map(Option.getOrElse(() => "")));

const assertAdoptionCurrent = (
  configPath: string,
  serverName: string,
  existing: unknown,
  adoption: NonNullable<WriteAgentMcpConfigArgs["adoption"]>,
): Effect.Effect<void, McpConfigInvalid> =>
  configPath === adoption.filePath && Equal.equals(existing, adoption.expectedEntry)
    ? Effect.void
    : Effect.fail(
        new McpConfigInvalid({
          detail: `MCP server ${serverName} changed before adoption at ${configPath}`,
        }),
      );

/** Render only after proving absence, ownership, or exact-observation adoption. */
const preserveOtherNativeValues = (args: {
  readonly configPath: string;
  readonly format: McpConfigTarget["format"];
  readonly serversPath: McpServersPath;
  readonly serverNames: ReadonlyArray<string>;
  readonly before: string;
  readonly after: string;
}) =>
  Effect.gen(function* () {
    const before = yield* readNativeMcpDocument({ ...args, raw: args.before });
    const after = yield* readNativeMcpDocument({ ...args, raw: args.after });
    const foreignValues = (
      root: Readonly<Record<string, unknown>>,
      depth = 0,
    ): Readonly<Record<string, unknown>> =>
      Object.fromEntries(
        Object.entries(root).flatMap(([key, value]) => {
          if (depth === args.serversPath.length)
            return args.serverNames.includes(key) ? [] : [[key, value]];
          if (key !== args.serversPath[depth] || !isRecord(value)) return [[key, value]];
          const retained = foreignValues(value, depth + 1);
          return Object.keys(retained).length === 0 ? [] : [[key, retained]];
        }),
      );
    if (!Equal.equals(foreignValues(before), foreignValues(after)))
      return yield* new McpConfigInvalid({
        detail: `Cannot change MCP entries without changing unrelated values at ${args.configPath}`,
      });
  });

const prepareMcpWrite = (args: WriteAgentMcpConfigArgs, configPath: string, raw: string) =>
  Effect.gen(function* () {
    const { target } = args;
    const values = yield* readNativeMcpValues({
      configPath,
      raw,
      format: target.format,
      serversPath: args.serversPath,
    });
    const existing = values[args.serverName];
    if (args.adoption !== undefined) {
      yield* assertAdoptionCurrent(configPath, args.serverName, existing, args.adoption);
    } else if (Object.hasOwn(values, args.serverName)) {
      const currentOwner = isRecord(existing) ? readAxmMcpMetadata(existing) : Option.none();
      const desiredOwner = readAxmMcpMetadata(args.entry);
      if (
        Option.isNone(currentOwner) ||
        Option.isNone(desiredOwner) ||
        (!Equal.equals(currentOwner.value, desiredOwner.value) &&
          !(args.previousManagedEntries ?? []).some((owner) =>
            Equal.equals(owner, currentOwner.value),
          ))
      ) {
        return yield* new McpEntryUnmanaged({ serverName: args.serverName, configPath });
      }
      if (target.format === "toml") {
        const region = reconcileKeyedBlock({
          content: raw,
          region: tomlRegion(args.serverName),
          owner: currentOwner.value.ext,
          rendered: "",
        });
        if (
          region.state.state !== "complete" ||
          region.state.startMarker.ext !== currentOwner.value.ext
        ) {
          return yield* new McpEntryUnmanaged({ serverName: args.serverName, configPath });
        }
      }
    }
    if (Equal.equals(existing, args.entry)) return raw;
    const renderArgs = {
      configPath,
      raw,
      serversPath: args.serversPath,
      serverName: args.serverName,
      entry: args.entry,
    };
    const next = yield* Effect.gen(function* () {
      switch (target.format) {
        case "toml":
          return yield* upsertToml({
            ...renderArgs,
            raw:
              args.adoption === undefined
                ? raw
                : yield* detachNativeTomlMcpEntry(raw, args.serversPath, args.serverName),
          });
        case "yaml":
          return yield* upsertYaml(renderArgs);
        case "json":
        case "jsonc":
        case "starlark":
        case "vscode-settings":
          return yield* upsertJsonLike({ ...renderArgs, format: target.format });
      }
    });
    yield* readNativeMcpValues({
      configPath,
      raw: next,
      format: target.format,
      serversPath: args.serversPath,
    });
    yield* preserveOtherNativeValues({
      configPath,
      format: target.format,
      serversPath: args.serversPath,
      serverNames: [args.serverName],
      before: raw,
      after: next,
    });
    if (
      !Object.hasOwn(values, args.serverName) &&
      Option.isNone(deriveStructuralInverse(raw, next))
    ) {
      return yield* new McpConfigInvalid({
        detail: `Cannot insert MCP server ${args.serverName} without changing unrelated content at ${configPath}`,
      });
    }
    return next;
  });

const insertionTarget = (
  args: {
    readonly workspaceRoot: string;
    readonly target: McpConfigTarget;
    readonly serverName: string;
    readonly serversPath: McpServersPath;
    readonly aliases?: ReadonlyArray<string>;
  },
  configPath: string,
) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const declaredPath =
      args.target.scope === "user" && args.target.path.startsWith("~/")
        ? args.target.path.slice(2)
        : args.target.path;
    return {
      path: configPath,
      unit: JSON.stringify(["mcp-server", args.serversPath, args.serverName]),
      aliases: args.aliases ?? [path.resolve(args.workspaceRoot, declaredPath)],
    };
  });

const describeNativeResult = (
  args: {
    readonly workspaceRoot: string;
    readonly target: McpConfigTarget;
    readonly serverName: string;
    readonly serversPath: McpServersPath;
    readonly aliases?: ReadonlyArray<string>;
  },
  configPath: string,
  result: AgentMcpConfigWriteResult,
  unitState?: NativeLocationOutcome["state"],
) =>
  Effect.gen(function* () {
    const receipt = yield* insertionTarget(args, configPath);
    return {
      targets: result.targets.map((target) => ({
        ...target,
        nativeLocation: {
          scope: args.target.scope,
          address: {
            kind: "key-path",
            path: configPath,
            keys: [...args.serversPath, args.serverName],
          },
          aliases: receipt.aliases,
          configuredConsumers: [],
          potentialReaders: [],
          policyReasons: [],
          ownership: "owned",
          proof: "managed-mcp-entry",
          state: unitState ?? target.change,
          mechanism: "structured-entry",
          availability: [],
        } satisfies NativeLocationOutcome,
      })),
    };
  });

/** Read-only preflight uses the same authority and complete-file parser as the writer. */
export const validateAgentMcpConfigWrite = (args: WriteAgentMcpConfigArgs) =>
  Effect.gen(function* () {
    const configPath = yield* resolveAgentMcpConfigTargetPath(args.workspaceRoot, args.target);
    return yield* prepareMcpWrite(args, configPath, yield* readExisting(configPath));
  });

export const writeAgentMcpConfig = (
  args: WriteAgentMcpConfigArgs,
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
        const before = yield* readNativeMcpConfig(configPath);
        const raw = Option.getOrElse(before, () => "");
        const values = yield* readNativeMcpValues({
          configPath,
          raw,
          format: args.target.format,
          serversPath: args.serversPath,
        });
        const next = yield* prepareMcpWrite(args, configPath, raw);
        const result =
          raw === next
            ? { targets: [{ path: args.target.path, change: "unchanged" as const }] }
            : yield* writeIfChanged(configPath, args.target.path, before, next, {
                ...(yield* insertionTarget(args, configPath)),
                eligible:
                  args.nativeInsertionEligible &&
                  args.adoption === undefined &&
                  !Object.hasOwn(values, args.serverName),
              });
        return yield* describeNativeResult(
          args,
          configPath,
          result,
          raw === next
            ? "unchanged"
            : Object.hasOwn(values, args.serverName)
              ? "updated"
              : "created",
        );
      }),
    );
  });

const renderMcpRemoval = (args: RemoveAgentMcpConfigArgs, configPath: string, raw: string) =>
  Effect.gen(function* () {
    switch (args.target.format) {
      case "toml":
        return yield* removeToml({
          raw,
          serversPath: args.serversPath,
          serverName: args.serverName,
          disableOnly: args.disableOnly,
          activationField: args.activationField,
        });
      case "yaml":
        return yield* removeYaml({
          configPath,
          raw,
          serversPath: args.serversPath,
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
          serversPath: args.serversPath,
          serverName: args.serverName,
          activationField: args.activationField,
          disableOnly: args.disableOnly,
        });
    }
  });

export type RemoveAgentMcpConfigsArgs = Omit<RemoveAgentMcpConfigArgs, "serverName"> & {
  readonly serverNames: ReadonlyArray<string>;
};

const renderMcpRemovals = (args: RemoveAgentMcpConfigsArgs, configPath: string, raw: string) =>
  Effect.gen(function* () {
    const values = yield* readNativeMcpValues({
      configPath,
      raw,
      format: args.target.format,
      serversPath: args.serversPath,
    });
    let next = raw;
    for (const serverName of [...new Set(args.serverNames)].sort()) {
      if (Object.hasOwn(values, serverName)) {
        const value = values[serverName];
        const metadata = isRecord(value) ? readAxmMcpMetadata(value) : Option.none();
        if (
          Option.isNone(metadata) ||
          !(args.expectedManagedEntries[serverName] ?? []).some((expected) =>
            Equal.equals(expected, metadata.value),
          )
        ) {
          return yield* new McpEntryUnmanaged({ serverName, configPath });
        }
      }
      next = yield* renderMcpRemoval({ ...args, serverName }, configPath, next);
    }
    yield* readNativeMcpValues({
      configPath,
      raw: next,
      format: args.target.format,
      serversPath: args.serversPath,
    });
    yield* preserveOtherNativeValues({
      configPath,
      format: args.target.format,
      serversPath: args.serversPath,
      serverNames: args.serverNames,
      before: raw,
      after: next,
    });
    return next;
  });

/** Validate all native removals without publishing an intermediate shared-file state. */
export const validateAgentMcpConfigRemovals = (args: RemoveAgentMcpConfigsArgs) =>
  Effect.gen(function* () {
    const configPath = yield* resolveAgentMcpConfigTargetPath(args.workspaceRoot, args.target);
    return yield* renderMcpRemovals(args, configPath, yield* readExisting(configPath));
  });

export const validateAgentMcpConfigRemoval = (args: RemoveAgentMcpConfigArgs) =>
  validateAgentMcpConfigRemovals({ ...args, serverNames: [args.serverName] });

/** Publish one physical file after every selected owned key has been prepared. */
export const removeAgentMcpConfigs = (
  args: RemoveAgentMcpConfigsArgs,
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
        const before = yield* readNativeMcpConfig(configPath);
        const raw = Option.getOrElse(before, () => "");
        const values = yield* readNativeMcpValues({
          configPath,
          raw,
          format: args.target.format,
          serversPath: args.serversPath,
        });
        const names = [...new Set(args.serverNames)]
          .filter((name) => Object.hasOwn(values, name))
          .sort();
        const rendered = yield* renderMcpRemovals(args, configPath, raw);
        if (raw === rendered) return { targets: [] };
        const receipts = yield* Effect.forEach(names, (serverName) =>
          insertionTarget({ ...args, serverName }, configPath),
        );
        const first = receipts[0];
        if (first === undefined) return { targets: [] };
        const inverse = args.disableOnly
          ? Option.none()
          : yield* authority.resolveInsertions({
              path: configPath,
              units: receipts.map((receipt) => receipt.unit),
              aliases: first.aliases,
              raw,
            });
        let result: AgentMcpConfigWriteResult;
        if (
          Option.isSome(inverse) &&
          inverse.value.kind === "remove-file" &&
          (yield* authority.retireInsertion({ ...first, raw, empty: true }))
        ) {
          result = { targets: [{ path: args.target.path, change: "removed" }] };
        } else {
          const next =
            Option.isSome(inverse) && inverse.value.kind === "restore-text"
              ? inverse.value.text
              : rendered;
          yield* readNativeMcpValues({
            configPath,
            raw: next,
            format: args.target.format,
            serversPath: args.serversPath,
          });
          yield* preserveOtherNativeValues({
            configPath,
            format: args.target.format,
            serversPath: args.serversPath,
            serverNames: names,
            before: raw,
            after: next,
          });
          result = yield* writeIfChanged(configPath, args.target.path, before, next, {
            ...first,
            eligible: false,
          });
          if (!args.disableOnly)
            for (const receipt of receipts) yield* authority.forgetInsertion(receipt);
        }
        const outcomes = yield* Effect.forEach(names, (serverName) =>
          describeNativeResult(
            { ...args, serverName },
            configPath,
            result,
            args.disableOnly ? "updated" : "removed",
          ),
        );
        return { targets: outcomes.flatMap((outcome) => outcome.targets) };
      }),
    );
  });

export const removeAgentMcpConfig = (args: RemoveAgentMcpConfigArgs) =>
  removeAgentMcpConfigs({ ...args, serverNames: [args.serverName] });

/** Retire only the exact declaration explicitly selected for conversion. */
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
    return yield* authority
      .withExclusiveWrite(
        configPath,
        Effect.gen(function* () {
          const before = yield* readNativeMcpConfig(configPath);
          const raw = Option.getOrElse(before, () => "");
          const values = yield* readNativeMcpValues({
            configPath,
            raw,
            format: args.target.format,
            serversPath: args.serversPath,
          });
          yield* assertAdoptionCurrent(
            configPath,
            args.serverName,
            values[args.serverName],
            args.adoption,
          );
          const next = yield* Effect.gen(function* () {
            switch (args.target.format) {
              case "toml":
                return yield* detachNativeTomlMcpEntry(raw, args.serversPath, args.serverName);
              case "yaml":
                return yield* retireYaml({
                  configPath,
                  raw,
                  serversPath: args.serversPath,
                  serverName: args.serverName,
                });
              case "json":
              case "jsonc":
              case "starlark":
              case "vscode-settings":
                return yield* retireJsonLike({
                  configPath,
                  raw,
                  serversPath: args.serversPath,
                  serverName: args.serverName,
                });
            }
          });
          yield* preserveOtherNativeValues({
            configPath,
            format: args.target.format,
            serversPath: args.serversPath,
            serverNames: [args.serverName],
            before: raw,
            after: next,
          });
          return yield* writeIfChanged(configPath, args.target.path, before, next, {
            ...(yield* insertionTarget(args, configPath)),
            eligible: false,
          });
        }),
      )
      .pipe(Effect.flatMap((result) => describeNativeResult(args, configPath, result, "removed")));
  });
