/**
 * Shared MCP sync helpers for coding-agent service implementations.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { parse, type ParseError } from "jsonc-parser";
import {
  AGENTS_BY_ID,
  type Agent,
  type AgentId as CapabilityAgentId,
  type McpConfig,
  type McpConfigTarget,
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
import { projectExpectedEntry } from "../mcps/projection.js";
import { resolveMcpServer } from "../mcps/resolution.js";
import { removeAgentMcpConfig, writeAgentMcpConfig } from "../mcps/config-writer.js";
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
  readonly canonical: Extract<
    AgentMcpCapability["canonical"],
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
  capability.axm.writer !== null && "transports" in capability.canonical;

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

export const runCliInvocation = (
  invocation: CliInvocation,
): Effect.Effect<CliInvocationResult, AppError> =>
  Effect.tryPromise({
    try: async () => {
      const { spawn } = await import("node:child_process");

      return new Promise<CliInvocationResult>((resolve, reject) => {
        const child = spawn(invocation.command, [...invocation.args], {
          cwd: invocation.cwd,
          stdio: ["ignore", "pipe", "pipe"],
        });

        const timeout = setTimeout(() => {
          child.kill("SIGTERM");
          resolve({
            // 124 follows the Unix `timeout(1)` convention; not an `ExitCode`.
            exitCode: 124,
            stdout: "",
            stderr: `Command timed out after ${invocation.timeoutMs}ms`,
          });
        }, invocation.timeoutMs);

        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk) => {
          stdout += String(chunk);
        });
        child.stderr.on("data", (chunk) => {
          stderr += String(chunk);
        });

        child.once("error", reject);
        child.once("close", (code) => {
          clearTimeout(timeout);
          resolve({
            exitCode: code ?? 1,
            stdout: redactSecrets(stdout.trim()),
            stderr: redactSecrets(stderr.trim()),
          });
        });
      });
    },
    catch: (error) =>
      makeAppError({
        code: "internal",
        detail: `Failed to execute MCP CLI command: ${invocation.command}`,
        cause: error,
      }),
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
  Effect.sync(() => {
    const errors: Array<ParseError> = [];
    const parsed: unknown = parse(raw, errors, { allowTrailingComma: true });
    if (errors.length > 0) throw errors;
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

    if (target.scope === "project" && !isPathSafe(workspaceRoot, configPath)) {
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
      isRecord(entry) && entry["managedBy"] === "axm" && !declaredServerNames.has(name)
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

    const exists = yield* fs.exists(configPath).pipe(Effect.catch(() => Effect.succeed(false)));
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
  managedBy: "axm",
  name: args.serverName,
  owner: args.owner,
  version: args.resolvedVersion,
  canonicalPath: args.canonicalPath,
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
}

export const syncInlineMcpServerToAgent = (
  agentId: string,
  args: SyncInlineMcpServerArgs,
): Effect.Effect<McpServerSyncOutcome, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    if (!isCapabilityAgentId(agentId)) {
      return {
        _tag: "unsupported",
        reason: `${agentId} has no MCP capability catalog entry`,
      } as const;
    }

    const agent: Agent = AGENTS_BY_ID[agentId];
    const capability = agent.capabilities["mcp-server"];
    if (!hasMcpConfig(capability)) {
      return {
        _tag: "unsupported",
        reason: `${agentId} does not have MCP config support`,
      } as const;
    }

    const config = capability.axm.writer.config;
    const projected = projectExpectedEntry({
      serverName: args.serverName,
      entry: args.entry,
      stdio: config.stdio,
      remote: config.remote,
      nativeEnabled: config.nativeEnabled,
      envExpansion: capability.canonical.mcpEnvExpansion,
    });

    if (projected._tag !== "projected") {
      return {
        _tag: "unsupported",
        reason: `${agentId} ${projected.reason}`,
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
          entry: projected.entry,
        }),
      { concurrency: "unbounded" },
    );
    const syncTargets = writeResults.flatMap((result) => result.targets);
    return {
      _tag: "success",
      targets: syncTargets,
      ...(projected.warnings.length > 0 ? { warnings: projected.warnings } : {}),
    } satisfies McpServerSyncOutcome;
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

    const agent: Agent = AGENTS_BY_ID[agentId];
    const capability = agent.capabilities["mcp-server"];
    if (!hasMcpConfig(capability)) {
      return {
        _tag: "unsupported",
        reason: `${agentId} does not have MCP config support`,
      } as const;
    }

    const config = capability.axm.writer.config;
    const targets = config.targets.filter((target) => target.scope === (args.scope ?? "project"));
    yield* Effect.forEach(
      targets,
      (target) =>
        Effect.gen(function* () {
          const configPath = yield* resolveMcpConfigTargetPath(args.workspaceRoot, target);
          const raw = yield* readOptionalConfig(configPath);
          if (Option.isNone(raw)) return;
          const staleNames =
            target.format === "toml"
              ? collectManagedTomlServerNames(raw.value, args.declaredServerNames)
              : yield* collectManagedJsonServerNames(
                  configPath,
                  raw.value,
                  config.serversKey,
                  args.declaredServerNames,
                );
          yield* Effect.forEach(
            staleNames,
            (serverName) =>
              removeAgentMcpConfig({
                workspaceRoot: args.workspaceRoot,
                serverName,
                serversKey: config.serversKey,
                target,
                nativeEnabled: config.nativeEnabled,
                disableOnly: false,
              }),
            { concurrency: "unbounded" },
          );
        }),
      { concurrency: "unbounded" },
    );
    return { _tag: "success" } as const;
  });

const isCapabilityAgentId = (id: string): id is CapabilityAgentId => id in AGENTS_BY_ID;

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
): Effect.Effect<McpServerSyncOutcome, AppError, FileSystem.FileSystem | Path.Path> =>
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
): Effect.Effect<McpServerSyncOutcome, AppError, FileSystem.FileSystem | Path.Path> =>
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
): Effect.Effect<McpServerSyncOutcome, AppError, FileSystem.FileSystem | Path.Path> =>
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
): Effect.Effect<McpServerSyncOutcome, AppError, FileSystem.FileSystem | Path.Path> =>
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
): Effect.Effect<McpServerSyncOutcome, AppError, FileSystem.FileSystem | Path.Path> =>
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

    const agent: Agent = AGENTS_BY_ID[agentId];
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

    const agent: Agent = AGENTS_BY_ID[agentId];
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
          nativeEnabled: config.nativeEnabled,
          disableOnly: args.disableOnly ?? false,
        }),
      { concurrency: "unbounded" },
    );
    const syncTargets = writeResults.flatMap((result) => result.targets);
    return { _tag: "success", targets: syncTargets } as const;
  });
