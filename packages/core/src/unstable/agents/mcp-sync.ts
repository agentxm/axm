/**
 * Shared MCP sync helpers for coding-agent service implementations.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Duration from "effect/Duration";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";
import { parse, type ParseError } from "jsonc-parser";
import {
  CONFIGURABLE_AGENTS_BY_ID,
  type Agent,
  type ConfigurableAgentId as CapabilityAgentId,
  type McpConfig,
  type McpConfigTarget,
  type McpEnvExpansion,
  type McpTransport,
} from "../agent-capabilities/index.js";
import { getHome } from "./constants.js";
import { envOption, isPathSafe } from "../utils/index.js";
import { makeAppError, type AppError } from "../app-error/index.js";
import {
  MCP_SERVER_MANIFEST_FILENAME,
  McpServerManifestSchema,
  type McpServerManifest,
} from "../mcps/manifest-schema.js";
import {
  AXM_MCP_METADATA_KEY,
  buildAxmMcpMetadata,
  isAxmManagedMcpEntry,
} from "../mcps/metadata.js";
import { inferInlineRemoteTransport, projectExpectedEntry } from "../mcps/projection.js";
import {
  resolveSharedMcpTarget,
  type SharedMcpTargetMember,
  type SharedMcpTransport,
} from "../mcps/shared-target.js";
import { resolveMcpServer } from "../mcps/resolution.js";
import { protectWorkspacePath } from "../workspace/transaction.js";
import { removeAgentMcpConfig, writeAgentMcpConfig } from "../mcps/config-writer.js";
import { managedYamlNames } from "../yaml/index.js";
import type {
  AddMcpServerArgs,
  McpServerSyncOutcome,
  McpServerSyncTarget,
  RemoveMcpServerArgs,
} from "./coding-agent.js";
import type { McpServerEntry } from "../settings/index.js";

export interface CliInvocation {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly timeoutMs: number;
  readonly cwd: string;
}

export interface CliInvocationResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

type NodePlatform = NodeJS.Platform;
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

const DEFAULT_SUPPORTED_PLATFORMS = ["darwin", "linux", "win32"] as const;

const JsonMcpConfigSchema = Schema.Struct({
  servers: Schema.Record(Schema.String, Schema.Unknown),
});
type JsonMcpConfig = typeof JsonMcpConfigSchema.Type;

const decodeJsonMcpConfigFromJsonString = Schema.decodeUnknownEffect(
  Schema.fromJsonString(JsonMcpConfigSchema),
);

const emptyJsonMcpConfig: JsonMcpConfig = { servers: {} };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasMcpConfig = (capability: AgentMcpCapability): capability is ConfiguredMcpCapability =>
  capability.axm.writer !== null && "transports" in capability.native;

const redactSecrets = (value: string): string =>
  value
    .replaceAll(/(token|secret|key|password)\s*[=:]\s*[^\s,]+/gi, "$1=[REDACTED]")
    .replaceAll(/(bearer)\s+[a-z0-9._-]+/gi, "$1 [REDACTED]");

const hasPathSeparator = (value: string): boolean => value.includes("/") || value.includes("\\");

const getExecutableCandidates = (command: string, pathExt: string): ReadonlyArray<string> => {
  if (process.platform !== "win32") {
    return [command];
  }

  const hasExtension =
    command.toLowerCase().endsWith(".exe") || command.toLowerCase().endsWith(".cmd");
  if (hasExtension) {
    return [command];
  }

  const extensions = pathExt
    .split(";")
    .map((segment) => segment.trim().toLowerCase())
    .filter((segment) => segment.length > 0);
  return [command, ...extensions.map((extension) => `${command}${extension}`)];
};

const checkExecutableAvailable = (
  command: string,
): Effect.Effect<boolean, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    if (command.trim().length === 0) {
      return false;
    }

    const pathExtOpt = yield* envOption("PATHEXT");
    const pathExt = Option.getOrElse(pathExtOpt, () => ".EXE;.CMD;.BAT;.COM");
    const directCandidates = getExecutableCandidates(command, pathExt);
    if (path.isAbsolute(command) || hasPathSeparator(command)) {
      const checks = yield* Effect.forEach(
        directCandidates,
        (candidate) => fs.exists(candidate).pipe(Effect.catch(() => Effect.succeed(false))),
        { concurrency: "unbounded" },
      );
      return checks.some(Boolean);
    }

    const rawPathOpt = yield* envOption("PATH");
    const rawPath = Option.getOrElse(rawPathOpt, () => "");
    if (rawPath.trim().length === 0) {
      return false;
    }

    const delimiter = process.platform === "win32" ? ";" : ":";
    const dirs = rawPath
      .split(delimiter)
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);

    const checks = yield* Effect.forEach(
      dirs,
      (dir) =>
        Effect.forEach(
          directCandidates,
          (candidate) =>
            fs.exists(path.join(dir, candidate)).pipe(Effect.catch(() => Effect.succeed(false))),
          { concurrency: "unbounded" },
        ).pipe(Effect.map((results) => results.some(Boolean))),
      { concurrency: "unbounded" },
    );

    return checks.some(Boolean);
  });

const unsupportedExecutableReason = (command: string): string =>
  `${command} CLI executable is unavailable on ${process.platform}; install ${command} and ensure it is on PATH`;

const collectStreamText = <E>(stream: Stream.Stream<Uint8Array, E>): Effect.Effect<string, E> =>
  Effect.gen(function* () {
    const chunks = yield* Stream.runCollect(stream);
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const bytes = new Uint8Array(totalLength);
    let offset = 0;

    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }

    return new TextDecoder("utf-8").decode(bytes);
  });

export const runCliInvocation = (
  invocation: CliInvocation,
): Effect.Effect<CliInvocationResult, AppError, ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    return yield* Effect.gen(function* () {
      const handle = yield* spawner.spawn(
        ChildProcess.make(invocation.command, invocation.args, {
          cwd: invocation.cwd,
          stdin: "ignore",
          // Scope close terminates the child with SIGTERM; escalate to
          // SIGKILL so an unresponsive CLI cannot stall the timeout path.
          forceKillAfter: Duration.seconds(2),
        }),
      );
      const collected = yield* Effect.all(
        {
          stdout: collectStreamText(handle.stdout),
          stderr: collectStreamText(handle.stderr),
          exitCode: handle.exitCode.pipe(
            Effect.map((code) => Number(code)),
            // A signal-terminated child reports no exit code; preserve the
            // previous `code ?? 1` convention instead of failing.
            Effect.catch(() => Effect.succeed(1)),
          ),
        },
        { concurrency: "unbounded" },
      );
      return {
        exitCode: collected.exitCode,
        stdout: redactSecrets(collected.stdout.trim()),
        stderr: redactSecrets(collected.stderr.trim()),
      };
    }).pipe(
      Effect.scoped,
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to execute MCP CLI command: ${invocation.command}`,
          cause: error,
        }),
      ),
      Effect.timeoutOrElse({
        duration: Duration.millis(invocation.timeoutMs),
        orElse: () =>
          Effect.succeed({
            // 124 follows the Unix `timeout(1)` convention; not an `ExitCode`.
            exitCode: 124,
            stdout: "",
            stderr: `Command timed out after ${invocation.timeoutMs}ms`,
          }),
      }),
    );
  });

const decodeJsonConfig = (
  configPath: string,
  raw: string,
): Effect.Effect<JsonMcpConfig, AppError> =>
  decodeJsonMcpConfigFromJsonString(raw).pipe(
    Effect.mapError((error) =>
      makeAppError({
        code: "validation",
        detail: `Invalid MCP config format: ${configPath}`,
        cause: error,
      }),
    ),
  );

const parseJsonObject = (configPath: string, raw: string): Effect.Effect<unknown, AppError> =>
  Effect.try({
    try: () => {
      const errors: Array<ParseError> = [];
      const parsed: unknown = parse(raw, errors, { allowTrailingComma: true });
      if (errors.length > 0) throw errors;
      return parsed;
    },
    catch: (error) =>
      makeAppError({
        code: "validation",
        detail: `Invalid MCP config JSON/JSONC: ${configPath}`,
        cause: error,
      }),
  });

const resolveMcpConfigTargetPath = (
  workspaceRoot: string,
  target: McpConfigTarget,
): Effect.Effect<string, AppError, Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const home = yield* getHome;
    const configPath =
      target.scope === "user"
        ? target.path.startsWith("~/")
          ? path.join(home, target.path.slice(2))
          : path.resolve(home, target.path)
        : path.resolve(workspaceRoot, target.path);

    if (target.scope === "project" && !isPathSafe(path, workspaceRoot, configPath)) {
      return yield* makeAppError({
        code: "validation",
        detail: `MCP config target escapes workspace root: ${target.path}`,
      });
    }
    return configPath;
  });

const readOptionalConfig = (
  configPath: string,
): Effect.Effect<Option.Option<string>, AppError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(configPath).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to inspect MCP config: ${configPath}`,
          cause: error,
        }),
      ),
    );
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

const collectManagedJsonServerNames = (
  configPath: string,
  raw: string,
  serversKey: string,
  declaredServerNames: ReadonlySet<string>,
): Effect.Effect<ReadonlyArray<string>, AppError> =>
  Effect.gen(function* () {
    const parsed = yield* parseJsonObject(configPath, raw);
    if (!isRecord(parsed)) return [];
    const servers = parsed[serversKey];
    if (!isRecord(servers)) return [];
    return Object.entries(servers).flatMap(([name, entry]) =>
      isRecord(entry) && isAxmManagedMcpEntry(entry) && !declaredServerNames.has(name)
        ? [name]
        : [],
    );
  });

const collectManagedTomlServerNames = (
  raw: string,
  declaredServerNames: ReadonlySet<string>,
): ReadonlyArray<string> => {
  const names: Array<string> = [];
  const blockPattern = /^# axm managed mcp-server ([a-z0-9][a-z0-9-]*) start$/gm;
  let match: RegExpExecArray | null;
  while ((match = blockPattern.exec(raw)) !== null) {
    const name = match[1];
    if (name !== undefined && !declaredServerNames.has(name)) names.push(name);
  }
  return names;
};

const collectManagedYamlServerNames = (
  configPath: string,
  raw: string,
  serversKey: string,
  declaredServerNames: ReadonlySet<string>,
): Effect.Effect<ReadonlyArray<string>, AppError> =>
  Effect.try({
    try: () => managedYamlNames(raw, serversKey, isAxmManagedMcpEntry),
    catch: (error) =>
      makeAppError({
        code: "validation",
        detail: `Invalid MCP config YAML: ${configPath}`,
        cause: error,
      }),
  }).pipe(Effect.map((names) => names.filter((name) => !declaredServerNames.has(name))));

const upsertJsonConfigServer = (
  configPath: string,
  serverName: string,
  entry: unknown,
): Effect.Effect<void, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = path.dirname(configPath);
    yield* fs.makeDirectory(dir, { recursive: true }).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to create config directory: ${dir}`,
          cause: error,
        }),
      ),
    );

    const exists = yield* fs.exists(configPath).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to inspect MCP config: ${configPath}`,
          cause: error,
        }),
      ),
    );
    const parsed = exists
      ? yield* fs.readFileString(configPath).pipe(
          Effect.mapError((error) =>
            makeAppError({
              code: "internal",
              detail: `Failed to read MCP config: ${configPath}`,
              cause: error,
            }),
          ),
          Effect.flatMap((raw) => decodeJsonConfig(configPath, raw)),
        )
      : emptyJsonMcpConfig;
    const updated = {
      ...parsed,
      servers: {
        ...parsed.servers,
        [serverName]: entry,
      },
    };

    yield* protectWorkspacePath(configPath);
    yield* fs.writeFileString(configPath, `${JSON.stringify(updated, null, 2)}\n`).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to write MCP config: ${configPath}`,
          cause: error,
        }),
      ),
    );
  });

const removeJsonConfigServer = (
  configPath: string,
  serverName: string,
): Effect.Effect<void, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(configPath).pipe(Effect.catch(() => Effect.succeed(false)));
    if (!exists) {
      return;
    }

    const existing = yield* fs.readFileString(configPath).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to read MCP config: ${configPath}`,
          cause: error,
        }),
      ),
    );
    const parsed = yield* decodeJsonConfig(configPath, existing);
    const { [serverName]: _, ...rest } = parsed.servers;
    void _;
    const updated = {
      ...parsed,
      servers: rest,
    };

    yield* protectWorkspacePath(configPath);
    yield* fs.writeFileString(configPath, `${JSON.stringify(updated, null, 2)}\n`).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to write MCP config: ${configPath}`,
          cause: error,
        }),
      ),
    );
  });

interface CliOutcomeMapping {
  readonly idempotentPatterns: ReadonlyArray<RegExp>;
}

const cliResultToOutcome = (
  result: CliInvocationResult,
  mapping: CliOutcomeMapping,
): McpServerSyncOutcome => {
  if (result.exitCode === 0) {
    return { _tag: "success" };
  }

  const stderr = result.stderr.toLowerCase();
  const combinedOutput = `${result.stdout}\n${result.stderr}`;
  if (mapping.idempotentPatterns.some((pattern) => pattern.test(combinedOutput))) {
    return { _tag: "success" };
  }

  if (
    stderr.includes("not found") ||
    stderr.includes("enoent") ||
    stderr.includes("cli not available")
  ) {
    return {
      _tag: "unsupported",
      reason: result.stderr.length > 0 ? result.stderr : "CLI executable not available",
    };
  }

  if (stderr.includes("auth") || stderr.includes("login") || stderr.includes("permission")) {
    return {
      _tag: "disabled",
      reason: result.stderr,
    };
  }

  if (stderr.includes("invalid") || stderr.includes("usage:")) {
    return {
      _tag: "misconfigured",
      reason: result.stderr,
    };
  }

  return {
    _tag: "failed",
    reason: result.stderr.length > 0 ? result.stderr : `Exit code ${result.exitCode}`,
  };
};

const ensurePlatformSupported = (
  command: string,
  supportedPlatforms: ReadonlyArray<NodePlatform>,
): Option.Option<McpServerSyncOutcome> => {
  const currentPlatform = process.platform;
  if (supportedPlatforms.includes(currentPlatform)) {
    return Option.none();
  }

  return Option.some({
    _tag: "unsupported",
    reason: `${command} MCP sync is unsupported on ${currentPlatform}; supported platforms: ${supportedPlatforms.join(", ")}`,
  });
};

const replaceTemplate = (value: string, args: AddMcpServerArgs | RemoveMcpServerArgs): string =>
  value
    .replaceAll("{workspaceRoot}", args.workspaceRoot)
    .replaceAll("{serverName}", args.serverName)
    .replaceAll("{canonicalPath}", "canonicalPath" in args ? args.canonicalPath : "")
    .replaceAll("{owner}", "owner" in args ? args.owner : "")
    .replaceAll("{resolvedVersion}", "resolvedVersion" in args ? args.resolvedVersion : "");

export interface MixedStrategyConfig {
  readonly configPath: string;
  readonly cliAdd: ReadonlyArray<string>;
  readonly cliRemove: ReadonlyArray<string>;
  readonly supportedPlatforms?: ReadonlyArray<NodePlatform>;
  readonly addIdempotentPatterns?: ReadonlyArray<RegExp>;
  readonly removeIdempotentPatterns?: ReadonlyArray<RegExp>;
  readonly timeoutMs?: number;
}

const ADD_IDEMPOTENT_PATTERNS: ReadonlyArray<RegExp> = [/already exists/i, /already added/i];
const REMOVE_IDEMPOTENT_PATTERNS: ReadonlyArray<RegExp> = [/not installed/i, /not configured/i];

const entryFromAddArgs = (args: AddMcpServerArgs) => ({
  [AXM_MCP_METADATA_KEY]: buildAxmMcpMetadata({
    source: "registry",
    ref: `${args.owner}/mcps/${args.serverName}`,
  }),
});

export interface SyncInlineMcpServerArgs {
  readonly workspaceRoot: string;
  readonly serverName: string;
  readonly entry: McpServerEntry;
  readonly scope?: "project" | "user";
}

export interface PruneManagedMcpServersArgs {
  readonly workspaceRoot: string;
  readonly declaredServerNames: ReadonlySet<string>;
  readonly scope?: "project" | "user";
  /** Inspect and report stale targets without changing agent configuration. */
  readonly dryRun?: boolean;
}

interface SharedSyncMember {
  readonly targetMember: SharedMcpTargetMember;
  readonly envExpansion: McpEnvExpansion | undefined;
}

interface SharedSyncAccumulator {
  readonly targets: Array<McpServerSyncTarget>;
  readonly warnings: Array<string>;
}

const sharedTransportForEntry = (
  entry: McpServerEntry,
): Effect.Effect<SharedMcpTransport, AppError> => {
  if (entry.command !== undefined) return Effect.succeed("stdio");
  if (entry.url !== undefined) {
    const inference = inferInlineRemoteTransport(entry.url);
    return inference._tag === "supported"
      ? Effect.succeed(inference.transport)
      : Effect.fail(
          makeAppError({
            code: "validation",
            detail: "Invalid inline MCP server URL",
            cause: inference.reason,
          }),
        );
  }
  return Effect.fail(
    makeAppError({
      code: "validation",
      detail: "Inline MCP server has no command or URL",
    }),
  );
};

export const syncInlineMcpServerToAgents = (
  agentIds: ReadonlyArray<string>,
  args: SyncInlineMcpServerArgs,
): Effect.Effect<
  ReadonlyArray<McpServerSyncOutcome>,
  AppError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const transport = yield* sharedTransportForEntry(args.entry);
    const scope = args.scope ?? "project";
    const terminalOutcomes = new Map<string, McpServerSyncOutcome>();
    const accumulators = new Map<string, SharedSyncAccumulator>();
    const groups = new Map<string, Array<SharedSyncMember>>();

    for (const agentId of agentIds) {
      if (!isCapabilityAgentId(agentId)) {
        terminalOutcomes.set(agentId, {
          _tag: "unsupported",
          reason: agentId + " has no MCP capability catalog entry",
        });
        continue;
      }
      const capability = CONFIGURABLE_AGENTS_BY_ID[agentId].capabilities["mcp-server"];
      if (!hasMcpConfig(capability)) {
        terminalOutcomes.set(agentId, {
          _tag: "unsupported",
          reason: agentId + " does not have MCP config support",
        });
        continue;
      }
      accumulators.set(agentId, { targets: [], warnings: [] });
      for (const target of capability.axm.writer.config.targets.filter(
        (candidate) => candidate.scope === scope,
      )) {
        const key = target.scope + ":" + target.path;
        const members = groups.get(key) ?? [];
        members.push({
          targetMember: {
            agentId,
            config: capability.axm.writer.config,
            target,
          },
          envExpansion: capability.native.mcpEnvExpansion,
        });
        groups.set(key, members);
      }
    }

    for (const members of groups.values()) {
      const resolution = resolveSharedMcpTarget({
        members: members.map((member) => member.targetMember),
        transport,
      });
      if (resolution._tag === "conflict") {
        return yield* makeAppError({
          code: "conflict",
          detail: resolution.reason,
        });
      }
      const projected = members.map((member) => ({
        agentId: member.targetMember.agentId,
        result: projectExpectedEntry({
          serverName: args.serverName,
          entry: args.entry,
          stdio: resolution.config.stdio,
          remote: resolution.config.remote,
          activationField: resolution.config.activationField,
          envExpansion: member.envExpansion,
        }),
      }));
      const unsupported = projected.find((item) => item.result._tag === "unsupported");
      if (unsupported !== undefined && unsupported.result._tag === "unsupported") {
        return yield* makeAppError({
          code: "conflict",
          detail:
            unsupported.agentId +
            " cannot read shared MCP target '" +
            resolution.path +
            "': " +
            unsupported.result.reason,
        });
      }
      const firstProjected = projected[0]?.result;
      if (firstProjected === undefined || firstProjected._tag !== "projected") {
        return yield* makeAppError({
          code: "internal",
          detail: "Shared MCP target projection produced no entry for " + resolution.path,
        });
      }
      const writeResult = yield* writeAgentMcpConfig({
        workspaceRoot: args.workspaceRoot,
        serverName: args.serverName,
        serversKey: resolution.config.serversKey,
        target: resolution.target,
        entry: firstProjected.entry,
      });
      for (const item of projected) {
        if (item.result._tag !== "projected") continue;
        const accumulator = accumulators.get(item.agentId);
        if (accumulator === undefined) continue;
        accumulator.targets.push(...writeResult.targets);
        accumulator.warnings.push(...item.result.warnings);
      }
    }

    return agentIds.map((agentId) => {
      const terminal = terminalOutcomes.get(agentId);
      if (terminal !== undefined) return terminal;
      const accumulator = accumulators.get(agentId);
      if (accumulator === undefined) {
        return {
          _tag: "unsupported",
          reason: agentId + " does not have MCP config support",
        };
      }
      return {
        _tag: "success",
        targets: accumulator.targets,
        ...(accumulator.warnings.length > 0 ? { warnings: accumulator.warnings } : {}),
      };
    });
  });

export const syncInlineMcpServerToAgent = (
  agentId: string,
  args: SyncInlineMcpServerArgs,
): Effect.Effect<McpServerSyncOutcome, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const outcomes = yield* syncInlineMcpServerToAgents([agentId], args);
    return (
      outcomes[0] ?? {
        _tag: "unsupported",
        reason: agentId + " does not have MCP config support",
      }
    );
  });

export const pruneManagedMcpServersForAgent = (
  agentId: string,
  args: PruneManagedMcpServersArgs,
): Effect.Effect<McpServerSyncOutcome, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    if (!isCapabilityAgentId(agentId)) {
      return {
        _tag: "unsupported",
        reason: `${agentId} has no MCP capability catalog entry`,
      } as const;
    }

    const agent: Agent = CONFIGURABLE_AGENTS_BY_ID[agentId];
    const capability = agent.capabilities["mcp-server"];
    if (!hasMcpConfig(capability)) {
      return {
        _tag: "unsupported",
        reason: `${agentId} does not have MCP config support`,
      } as const;
    }

    const config = capability.axm.writer.config;
    const targets = config.targets.filter((target) => target.scope === (args.scope ?? "project"));
    const prunedTargets: Array<McpServerSyncTarget> = [];
    yield* Effect.forEach(
      targets,
      (target) =>
        Effect.gen(function* () {
          const configPath = yield* resolveMcpConfigTargetPath(args.workspaceRoot, target);
          const raw = yield* readOptionalConfig(configPath);
          if (Option.isNone(raw)) return;
          const staleNames = yield* Effect.gen(function* () {
            switch (target.format) {
              case "toml":
                return collectManagedTomlServerNames(raw.value, args.declaredServerNames);
              case "yaml":
                return yield* collectManagedYamlServerNames(
                  configPath,
                  raw.value,
                  config.serversKey,
                  args.declaredServerNames,
                );
              case "json":
              case "jsonc":
              case "starlark":
              case "vscode-settings":
                return yield* collectManagedJsonServerNames(
                  configPath,
                  raw.value,
                  config.serversKey,
                  args.declaredServerNames,
                );
            }
          });
          if (staleNames.length === 0) return;
          if (args.dryRun !== true) {
            yield* Effect.forEach(
              staleNames,
              (serverName) =>
                removeAgentMcpConfig({
                  workspaceRoot: args.workspaceRoot,
                  serverName,
                  serversKey: config.serversKey,
                  target,
                  activationField: config.activationField,
                  disableOnly: false,
                }),
              { concurrency: "unbounded" },
            );
          }
          prunedTargets.push({ path: configPath, change: "updated" });
        }),
      { concurrency: "unbounded" },
    );
    return {
      _tag: "success",
      ...(prunedTargets.length > 0 ? { targets: prunedTargets } : {}),
    } satisfies McpServerSyncOutcome;
  });

const isCapabilityAgentId = (id: string): id is CapabilityAgentId =>
  id in CONFIGURABLE_AGENTS_BY_ID;

const decodeManifestAt = (
  manifestPath: string,
): Effect.Effect<McpServerManifest, AppError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const raw = yield* fs.readFileString(manifestPath).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to read MCP server manifest: ${manifestPath}`,
          cause: error,
        }),
      ),
    );
    const parsed = yield* Effect.try({
      try: () => {
        const value: unknown = JSON.parse(raw);
        return value;
      },
      catch: (error) =>
        makeAppError({
          code: "validation",
          detail: `Invalid JSON in MCP server manifest: ${manifestPath}`,
          cause: error,
        }),
    });
    return yield* Schema.decodeUnknownEffect(McpServerManifestSchema)(parsed).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "validation",
          detail: `Invalid MCP server manifest: ${manifestPath}`,
          cause: error,
        }),
      ),
    );
  });

const fallbackOutcome = (
  fallbackFrom: "unsupported" | "disabled",
  reason: string,
  targets?: ReadonlyArray<McpServerSyncTarget>,
): McpServerSyncOutcome => ({
  _tag: "fallback",
  fallbackFrom,
  reason,
  ...(targets === undefined ? {} : { targets }),
});

export const addMcpServerMixed = (
  strategy: MixedStrategyConfig,
  args: AddMcpServerArgs,
): Effect.Effect<
  McpServerSyncOutcome,
  AppError,
  FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function* () {
    const platformOutcome = ensurePlatformSupported(
      strategy.cliAdd[0] ?? "cli",
      strategy.supportedPlatforms ?? DEFAULT_SUPPORTED_PLATFORMS,
    );
    if (Option.isSome(platformOutcome)) {
      return platformOutcome.value;
    }

    const executableAvailable = yield* checkExecutableAvailable(strategy.cliAdd[0] ?? "");
    const cliOutcome = executableAvailable
      ? yield* runCliInvocation({
          command: strategy.cliAdd[0] ?? "",
          args: strategy.cliAdd.slice(1).map((value) => replaceTemplate(value, args)),
          timeoutMs: strategy.timeoutMs ?? 10_000,
          cwd: args.workspaceRoot,
        }).pipe(
          Effect.map((invocation) =>
            cliResultToOutcome(invocation, {
              idempotentPatterns: strategy.addIdempotentPatterns ?? ADD_IDEMPOTENT_PATTERNS,
            }),
          ),
        )
      : ({
          _tag: "unsupported",
          reason: unsupportedExecutableReason(strategy.cliAdd[0] ?? "cli"),
        } as const);
    if (cliOutcome._tag === "success") {
      return cliOutcome;
    }

    if (cliOutcome._tag === "unsupported") {
      yield* upsertJsonConfigServer(
        strategy.configPath.replaceAll("{workspaceRoot}", args.workspaceRoot),
        args.serverName,
        entryFromAddArgs(args),
      );
      return fallbackOutcome("unsupported", cliOutcome.reason);
    }

    if (cliOutcome._tag === "disabled") {
      yield* upsertJsonConfigServer(
        strategy.configPath.replaceAll("{workspaceRoot}", args.workspaceRoot),
        args.serverName,
        entryFromAddArgs(args),
      );
      return fallbackOutcome("disabled", cliOutcome.reason);
    }

    return cliOutcome;
  });

export const removeMcpServerMixed = (
  strategy: MixedStrategyConfig,
  args: RemoveMcpServerArgs,
): Effect.Effect<
  McpServerSyncOutcome,
  AppError,
  FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function* () {
    const platformOutcome = ensurePlatformSupported(
      strategy.cliRemove[0] ?? "cli",
      strategy.supportedPlatforms ?? DEFAULT_SUPPORTED_PLATFORMS,
    );
    if (Option.isSome(platformOutcome)) {
      return platformOutcome.value;
    }

    const executableAvailable = yield* checkExecutableAvailable(strategy.cliRemove[0] ?? "");
    const cliOutcome = executableAvailable
      ? yield* runCliInvocation({
          command: strategy.cliRemove[0] ?? "",
          args: strategy.cliRemove.slice(1).map((value) => replaceTemplate(value, args)),
          timeoutMs: strategy.timeoutMs ?? 10_000,
          cwd: args.workspaceRoot,
        }).pipe(
          Effect.map((invocation) =>
            cliResultToOutcome(invocation, {
              idempotentPatterns: strategy.removeIdempotentPatterns ?? REMOVE_IDEMPOTENT_PATTERNS,
            }),
          ),
        )
      : ({
          _tag: "unsupported",
          reason: unsupportedExecutableReason(strategy.cliRemove[0] ?? "cli"),
        } as const);
    if (cliOutcome._tag === "success") {
      return cliOutcome;
    }

    if (cliOutcome._tag === "unsupported" || cliOutcome._tag === "disabled") {
      yield* removeJsonConfigServer(
        strategy.configPath.replaceAll("{workspaceRoot}", args.workspaceRoot),
        args.serverName,
      );
      return fallbackOutcome(cliOutcome._tag, cliOutcome.reason);
    }

    return cliOutcome;
  });

export const addMcpServerConfigOnly = (
  configPathTemplate: string,
  args: AddMcpServerArgs,
): Effect.Effect<McpServerSyncOutcome, AppError, FileSystem.FileSystem | Path.Path> =>
  upsertJsonConfigServer(
    configPathTemplate.replaceAll("{workspaceRoot}", args.workspaceRoot),
    args.serverName,
    entryFromAddArgs(args),
  ).pipe(Effect.as({ _tag: "success" } as const));

export const removeMcpServerConfigOnly = (
  configPathTemplate: string,
  args: RemoveMcpServerArgs,
): Effect.Effect<McpServerSyncOutcome, AppError, FileSystem.FileSystem | Path.Path> =>
  removeJsonConfigServer(
    configPathTemplate.replaceAll("{workspaceRoot}", args.workspaceRoot),
    args.serverName,
  ).pipe(Effect.as({ _tag: "success" } as const));

export interface ConfigFirstStrategy {
  readonly configPath: string;
  readonly verifyCommand?: ReadonlyArray<string>;
  readonly supportedPlatforms?: ReadonlyArray<NodePlatform>;
  readonly timeoutMs?: number;
}

const verifyConfigFirst = (
  strategy: ConfigFirstStrategy,
  args: AddMcpServerArgs | RemoveMcpServerArgs,
): Effect.Effect<
  McpServerSyncOutcome,
  AppError,
  FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function* () {
    if (strategy.verifyCommand === undefined || strategy.verifyCommand.length === 0) {
      return { _tag: "success" } as const;
    }

    const platformOutcome = ensurePlatformSupported(
      strategy.verifyCommand[0] ?? "cli",
      strategy.supportedPlatforms ?? DEFAULT_SUPPORTED_PLATFORMS,
    );
    if (Option.isSome(platformOutcome)) {
      return { _tag: "success" } as const;
    }

    const executableAvailable = yield* checkExecutableAvailable(strategy.verifyCommand[0] ?? "");
    if (!executableAvailable) {
      return { _tag: "success" } as const;
    }

    const invocation = yield* runCliInvocation({
      command: strategy.verifyCommand[0] ?? "",
      args: strategy.verifyCommand.slice(1).map((value) => replaceTemplate(value, args)),
      timeoutMs: strategy.timeoutMs ?? 10_000,
      cwd: args.workspaceRoot,
    });

    const outcome = cliResultToOutcome(invocation, {
      idempotentPatterns: [],
    });
    if (outcome._tag === "disabled") {
      return outcome;
    }
    if (outcome._tag === "misconfigured" || outcome._tag === "failed") {
      return outcome;
    }
    return { _tag: "success" } as const;
  });

export const addMcpServerConfigFirst = (
  strategy: ConfigFirstStrategy,
  args: AddMcpServerArgs,
): Effect.Effect<
  McpServerSyncOutcome,
  AppError,
  FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function* () {
    yield* upsertJsonConfigServer(
      strategy.configPath.replaceAll("{workspaceRoot}", args.workspaceRoot),
      args.serverName,
      entryFromAddArgs(args),
    );
    return yield* verifyConfigFirst(strategy, args);
  });

export const removeMcpServerConfigFirst = (
  strategy: ConfigFirstStrategy,
  args: RemoveMcpServerArgs,
): Effect.Effect<
  McpServerSyncOutcome,
  AppError,
  FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function* () {
    yield* removeJsonConfigServer(
      strategy.configPath.replaceAll("{workspaceRoot}", args.workspaceRoot),
      args.serverName,
    );
    return yield* verifyConfigFirst(strategy, args);
  });

export const addMcpServerFromManifest = (
  agentId: string,
  args: AddMcpServerArgs,
): Effect.Effect<McpServerSyncOutcome, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    if (!isCapabilityAgentId(agentId)) {
      return {
        _tag: "unsupported",
        reason: `${agentId} has no MCP capability catalog entry`,
      } as const;
    }

    const agent: Agent = CONFIGURABLE_AGENTS_BY_ID[agentId];
    const capability = agent.capabilities["mcp-server"];
    if (!hasMcpConfig(capability)) {
      return {
        _tag: "unsupported",
        reason: `${agentId} does not have MCP config support`,
      } as const;
    }
    const config = capability.axm.writer.config;

    const manifest = yield* decodeManifestAt(
      path.join(args.canonicalPath, MCP_SERVER_MANIFEST_FILENAME),
    );
    const resolution = resolveMcpServer({
      manifest,
      capability,
      values: args.configValues ?? {},
      enabled: args.enabled ?? true,
    });

    if (resolution._tag === "nothing-runnable") {
      return resolution;
    }
    if (resolution._tag === "no-distribution") {
      return {
        _tag: "unsupported",
        reason: resolution.reason,
      } as const;
    }

    const targets = config.targets.filter((target) => target.scope === (args.scope ?? "project"));
    const writeResults = yield* Effect.forEach(
      targets,
      (target) =>
        writeAgentMcpConfig({
          workspaceRoot: args.workspaceRoot,
          serverName: args.serverName,
          serversKey: config.serversKey,
          target,
          entry: resolution.entry,
        }),
      { concurrency: "unbounded" },
    );
    const syncTargets = writeResults.flatMap((result) => result.targets);

    if (resolution._tag === "needs-input") {
      return {
        _tag: "needs-input",
        reason: resolution.warnings.join("; "),
      } as const;
    }
    if (resolution.shimmed) {
      return {
        _tag: "fallback",
        fallbackFrom: "unsupported",
        reason: resolution.warnings.join("; "),
        targets: syncTargets,
      } as const;
    }
    return { _tag: "success", targets: syncTargets } as const;
  });

export const removeMcpServerFromManifest = (
  agentId: string,
  args: RemoveMcpServerArgs,
): Effect.Effect<McpServerSyncOutcome, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    if (!isCapabilityAgentId(agentId)) {
      return {
        _tag: "unsupported",
        reason: `${agentId} has no MCP capability catalog entry`,
      } as const;
    }

    const agent: Agent = CONFIGURABLE_AGENTS_BY_ID[agentId];
    const capability = agent.capabilities["mcp-server"];
    if (!hasMcpConfig(capability)) {
      return {
        _tag: "unsupported",
        reason: `${agentId} does not have MCP config support`,
      } as const;
    }
    const config = capability.axm.writer.config;

    const targets = config.targets.filter((target) => target.scope === (args.scope ?? "project"));
    const writeResults = yield* Effect.forEach(
      targets,
      (target) =>
        removeAgentMcpConfig({
          workspaceRoot: args.workspaceRoot,
          serverName: args.serverName,
          serversKey: config.serversKey,
          target,
          activationField: config.activationField,
          disableOnly: args.disableOnly ?? false,
        }),
      { concurrency: "unbounded" },
    );
    const syncTargets = writeResults.flatMap((result) => result.targets);
    return { _tag: "success", targets: syncTargets } as const;
  });
