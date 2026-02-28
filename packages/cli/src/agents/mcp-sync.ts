/**
 * Shared MCP sync helpers for coding-agent service implementations.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as Effect from "effect/Effect";
import { makeCliError, type CliError } from "../cli-error/index.js";
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

const redactSecrets = (value: string): string =>
  value.replaceAll(/(token|secret|key|password)\s*[=:]\s*[^\s,]+/gi, "$1=[REDACTED]");

export const runCliInvocation = (
  invocation: CliInvocation,
): Effect.Effect<CliInvocationResult, CliError> =>
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
      makeCliError({
        code: "CODING_AGENT_MCP_CLI_EXECUTION_FAILED",
        what: `Failed to execute MCP CLI command: ${invocation.command}`,
        details: [
          `args=${invocation.args.join(" ")}`,
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
  const parsed = JSON.parse(raw) as unknown;
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "servers" in parsed &&
    typeof (parsed as { servers?: unknown }).servers === "object" &&
    (parsed as { servers?: unknown }).servers !== null
  ) {
    return {
      servers: { ...(parsed as { servers: Record<string, unknown> }).servers },
    };
  }
  return { servers: {} };
};

const upsertJsonConfigServer = (
  configPath: string,
  serverName: string,
  entry: unknown,
): Effect.Effect<void, CliError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = path.dirname(configPath);
    yield* fs.makeDirectory(dir, { recursive: true }).pipe(
      Effect.mapError((error) =>
        makeCliError({
          code: "CODING_AGENT_MCP_CONFIG_WRITE_FAILED",
          what: `Failed to create config directory: ${dir}`,
          cause: error,
        }),
      ),
    );

    const existing = yield* fs
      .readFileString(configPath)
      .pipe(Effect.catchAll(() => Effect.succeed('{\n  "servers": {}\n}')));
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
        makeCliError({
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
): Effect.Effect<void, CliError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(configPath).pipe(Effect.catchAll(() => Effect.succeed(false)));
    if (!exists) {
      return;
    }

    const existing = yield* fs.readFileString(configPath).pipe(
      Effect.mapError((error) =>
        makeCliError({
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
        makeCliError({
          code: "CODING_AGENT_MCP_CONFIG_WRITE_FAILED",
          what: `Failed to write MCP config: ${configPath}`,
          cause: error,
        }),
      ),
    );
  });

const cliResultToOutcome = (result: CliInvocationResult): McpServerSyncOutcome => {
  if (result.exitCode === 0) {
    return { _tag: "success" };
  }

  const stderr = result.stderr.toLowerCase();
  if (stderr.includes("not found") || stderr.includes("enoent")) {
    return {
      _tag: "unsupported",
      reason: result.stderr.length > 0 ? result.stderr : "CLI executable not available",
    };
  }

  if (stderr.includes("already exists") || stderr.includes("already added")) {
    return { _tag: "success" };
  }

  if (stderr.includes("not installed") || stderr.includes("not configured")) {
    return { _tag: "success" };
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

export interface MixedStrategyConfig {
  readonly configPath: string;
  readonly cliAdd: ReadonlyArray<string>;
  readonly cliRemove: ReadonlyArray<string>;
  readonly timeoutMs?: number;
}

const entryFromAddArgs = (args: AddMcpServerArgs) => ({
  managedBy: "axm",
  name: args.serverName,
  namespace: args.namespace,
  version: args.resolvedVersion,
  canonicalPath: args.canonicalPath,
});

export const addMcpServerMixed = (
  strategy: MixedStrategyConfig,
  args: AddMcpServerArgs,
): Effect.Effect<McpServerSyncOutcome, CliError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const invocation = yield* runCliInvocation({
      command: strategy.cliAdd[0] ?? "",
      args: strategy.cliAdd
        .slice(1)
        .map((value) => value.replaceAll("{serverName}", args.serverName)),
      timeoutMs: strategy.timeoutMs ?? 10_000,
      cwd: args.workspaceRoot,
    }).pipe(
      Effect.catchAll(() =>
        Effect.succeed({
          exitCode: 127,
          stdout: "",
          stderr: "CLI not available",
        } satisfies CliInvocationResult),
      ),
    );

    const cliOutcome = cliResultToOutcome(invocation);
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
): Effect.Effect<McpServerSyncOutcome, CliError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const invocation = yield* runCliInvocation({
      command: strategy.cliRemove[0] ?? "",
      args: strategy.cliRemove
        .slice(1)
        .map((value) => value.replaceAll("{serverName}", args.serverName)),
      timeoutMs: strategy.timeoutMs ?? 10_000,
      cwd: args.workspaceRoot,
    }).pipe(
      Effect.catchAll(() =>
        Effect.succeed({
          exitCode: 127,
          stdout: "",
          stderr: "CLI not available",
        } satisfies CliInvocationResult),
      ),
    );
    const cliOutcome = cliResultToOutcome(invocation);
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
): Effect.Effect<McpServerSyncOutcome, CliError, FileSystem.FileSystem | Path.Path> =>
  upsertJsonConfigServer(
    configPathTemplate.replaceAll("{workspaceRoot}", args.workspaceRoot),
    args.serverName,
    entryFromAddArgs(args),
  ).pipe(Effect.as({ _tag: "success" } as const));

export const removeMcpServerConfigOnly = (
  configPathTemplate: string,
  args: RemoveMcpServerArgs,
): Effect.Effect<McpServerSyncOutcome, CliError, FileSystem.FileSystem | Path.Path> =>
  removeJsonConfigServer(
    configPathTemplate.replaceAll("{workspaceRoot}", args.workspaceRoot),
    args.serverName,
  ).pipe(Effect.as({ _tag: "success" } as const));
