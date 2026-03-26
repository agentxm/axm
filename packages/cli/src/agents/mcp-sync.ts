/**
 * Shared MCP sync helpers for coding-agent service implementations.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import { envOption } from "@axm.sh/core/unstable/utils";
import { makeAppError, type AppError } from "@axm.sh/core/unstable/app-error";
import type {
  AddMcpServerArgs,
  McpServerSyncOutcome,
  RemoveMcpServerArgs,
} from "./coding-agent.js";

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

const DEFAULT_SUPPORTED_PLATFORMS = ["darwin", "linux", "win32"] as const;

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

      const maybeResult = await new Promise<CliInvocationResult | null>((resolve, reject) => {
        const child = spawn(invocation.command, [...invocation.args], {
          cwd: invocation.cwd,
          stdio: ["ignore", "pipe", "pipe"],
        });

        const timeout = setTimeout(() => {
          child.kill("SIGTERM");
          resolve({
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

      if (maybeResult === null) {
        return {
          exitCode: 1,
          stdout: "",
          stderr: "Command execution produced no result",
        } satisfies CliInvocationResult;
      }

      return maybeResult;
    },
    catch: (error) =>
      makeAppError({
        code: "CODING_AGENT_MCP_CLI_EXECUTION_FAILED",
        what: `Failed to execute MCP CLI command: ${invocation.command}`,
        details: [
          `args=${redactSecrets(invocation.args.join(" "))}`,
          `cwd=${invocation.cwd}`,
          `error=${String(error)}`,
        ],
        cause: error,
      }),
  });

interface JsonMcpConfig {
  readonly servers: Record<string, unknown>;
}

const decodeJsonConfig = (raw: string): JsonMcpConfig => {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed === "object" && parsed !== null) {
    const servers = Reflect.get(parsed, "servers");
    if (typeof servers === "object" && servers !== null) {
      const normalizedServers: Record<string, unknown> = Object.fromEntries(Object.entries(servers));
      return {
        servers: normalizedServers,
      };
    }
  }
  return { servers: {} };
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
          code: "CODING_AGENT_MCP_CONFIG_WRITE_FAILED",
          what: `Failed to create config directory: ${dir}`,
          cause: error,
        }),
      ),
    );

    const existing = yield* fs
      .readFileString(configPath)
      .pipe(Effect.catch(() => Effect.succeed('{\n  "servers": {}\n}')));
    const parsed = decodeJsonConfig(existing);
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
          code: "CODING_AGENT_MCP_CONFIG_WRITE_FAILED",
          what: `Failed to write MCP config: ${configPath}`,
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
          code: "CODING_AGENT_MCP_CONFIG_READ_FAILED",
          what: `Failed to read MCP config: ${configPath}`,
          cause: error,
        }),
      ),
    );
    const parsed = decodeJsonConfig(existing);
    const { [serverName]: _, ...rest } = parsed.servers;
    void _;
    const updated = {
      ...parsed,
      servers: rest,
    };

    yield* fs.writeFileString(configPath, `${JSON.stringify(updated, null, 2)}\n`).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "CODING_AGENT_MCP_CONFIG_WRITE_FAILED",
          what: `Failed to write MCP config: ${configPath}`,
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
): McpServerSyncOutcome | null => {
  const currentPlatform = process.platform;
  if (supportedPlatforms.includes(currentPlatform)) {
    return null;
  }

  return {
    _tag: "unsupported",
    reason: `${command} MCP sync is unsupported on ${currentPlatform}; supported platforms: ${supportedPlatforms.join(", ")}`,
  };
};

const replaceTemplate = (value: string, args: AddMcpServerArgs | RemoveMcpServerArgs): string =>
  value
    .replaceAll("{workspaceRoot}", args.workspaceRoot)
    .replaceAll("{serverName}", args.serverName)
    .replaceAll("{canonicalPath}", "canonicalPath" in args ? args.canonicalPath : "")
    .replaceAll("{profile}", "profile" in args ? args.profile : "")
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
  profile: args.profile,
  version: args.resolvedVersion,
  canonicalPath: args.canonicalPath,
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
    if (platformOutcome !== null) {
      return platformOutcome;
    }

    const executableAvailable = yield* checkExecutableAvailable(strategy.cliAdd[0] ?? "");
    const cliOutcome = executableAvailable
      ? yield* runCliInvocation({
          command: strategy.cliAdd[0] ?? "",
          args: strategy.cliAdd.slice(1).map((value) => replaceTemplate(value, args)),
          timeoutMs: strategy.timeoutMs ?? 10_000,
          cwd: args.workspaceRoot,
        }).pipe(
          Effect.catch(() =>
            Effect.succeed({
              exitCode: 127,
              stdout: "",
              stderr: "CLI not available",
            } satisfies CliInvocationResult),
          ),
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
      return { _tag: "success" };
    }

    if (cliOutcome._tag === "disabled") {
      yield* upsertJsonConfigServer(
        strategy.configPath.replaceAll("{workspaceRoot}", args.workspaceRoot),
        args.serverName,
        entryFromAddArgs(args),
      );
      return { _tag: "success" };
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
    if (platformOutcome !== null) {
      return platformOutcome;
    }

    const executableAvailable = yield* checkExecutableAvailable(strategy.cliRemove[0] ?? "");
    const cliOutcome = executableAvailable
      ? yield* runCliInvocation({
          command: strategy.cliRemove[0] ?? "",
          args: strategy.cliRemove.slice(1).map((value) => replaceTemplate(value, args)),
          timeoutMs: strategy.timeoutMs ?? 10_000,
          cwd: args.workspaceRoot,
        }).pipe(
          Effect.catch(() =>
            Effect.succeed({
              exitCode: 127,
              stdout: "",
              stderr: "CLI not available",
            } satisfies CliInvocationResult),
          ),
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
      return { _tag: "success" };
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
    if (platformOutcome !== null) {
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
    }).pipe(
      Effect.catch(() =>
        Effect.succeed({
          exitCode: 127,
          stdout: "",
          stderr: "CLI not available",
        } satisfies CliInvocationResult),
      ),
    );

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
