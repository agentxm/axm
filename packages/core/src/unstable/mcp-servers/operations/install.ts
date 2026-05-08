/**
 * Install MCP server executor — orchestrates the per-server installation pipeline.
 *
 * Registry-only install: fetch archive, extract to canonical path, update lockfile/settings.
 * Simpler than skills — no agent symlinks.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { AgentId } from "../../agents/index.js";
import type { CodingAgent, McpServerSyncOutcome } from "../../agents/coding-agent.js";
import { CodingAgentRepository } from "../../agents/index.js";
import { CliRenderer } from "../../cli-renderer/index.js";
import { computeIntegrity, isPathSafe } from "../../utils/index.js";
import { makeAppError, type AppError } from "../../app-error/index.js";
import type { Handle } from "../../extensions/handle.js";
import { validateExactResolvedVersion } from "../../lockfile/index.js";
import { createRegistryClient, extractZip } from "../../registry/index.js";
import type { JobStepResult, Operation } from "../../plan/plan.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import { REGISTRY_EXTENSIONS_DIR } from "../../extensions/index.js";
import type { McpServerExtensionRef, RegistryMcpServerRef } from "../refs.js";
import type { McpServerLockEntry } from "../../lockfile/index.js";
import { decodeExactSemverVersionSync } from "../../version-constraints/version-constraints.js";

// -----------------------------------------------------------------------------
// Operation types
// -----------------------------------------------------------------------------

/**
 * Args for the install-mcp-server operation.
 */
export type InstallMcpServerOperationArgs = {
  readonly ref: McpServerExtensionRef;
  readonly force: boolean;
  readonly versionConstraint: Option.Option<string>;
  /** When true, write to lockfile only (skip settings). Used for pack dependencies. */
  readonly skipSettings: Option.Option<boolean>;
  /** When true, enforce strict policy for MCP sync outcomes. */
  readonly strictAgentSync?: Option.Option<boolean>;
};

/**
 * Add an MCP server to the workspace.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type InstallMcpServerOperation = Operation<
  "install-mcp-server",
  InstallMcpServerOperationArgs
>;

// -----------------------------------------------------------------------------
// Lock entry builder
// -----------------------------------------------------------------------------

const buildLockEntry = (ref: RegistryMcpServerRef, now: Date): McpServerLockEntry => ({
  type: "registry",
  owner: ref.owner,
  name: ref.name,
  resolvedVersion: decodeExactSemverVersionSync(ref.version),
  integrity: Option.getOrElse(ref.integrity, () => ""),
  sourceName: "default",
  installedAt: now,
  updatedAt: now,
});

// -----------------------------------------------------------------------------
// Registry install
// -----------------------------------------------------------------------------

const installFromRegistry = (ref: RegistryMcpServerRef) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;

    const canonicalPath = path.join(
      ws.baseDir,
      REGISTRY_EXTENSIONS_DIR,
      ref.owner,
      "mcp-servers",
      ref.name,
    );

    if (!isPathSafe(ws.baseDir, canonicalPath)) {
      return yield* makeAppError({
        code: "internal",
        message: `Path traversal detected: ${canonicalPath}`,
      });
    }

    // Empty integrity with existing canonical → skip fetch (synthetic refs from publish)
    const canonicalExists = yield* fs.exists(canonicalPath).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "internal",
          message: `Failed to check if canonical path exists: ${canonicalPath}`,
          cause: e,
        }),
      ),
    );
    const useExisting = Option.isNone(ref.integrity) && canonicalExists;

    if (!useExisting) {
      const locationStr =
        ref.source.location.protocol === "file:"
          ? ref.source.location.pathname
          : ref.source.location.href;
      const client = yield* createRegistryClient(locationStr);
      const { archive } = yield* client.getExtensionPackage({
        owner: ref.owner,
        type: "mcp-server",
        name: ref.name,
        version: Option.some(ref.version),
      });

      if (Option.isSome(ref.integrity)) {
        const actualIntegrity = yield* computeIntegrity(archive);
        if (actualIntegrity !== ref.integrity.value) {
          return yield* makeAppError({
            code: "internal",
            message: `Integrity mismatch for ${ref.name}@${ref.version}`,
          });
        }
      }

      const tmpDir = yield* fs.makeTempDirectory().pipe(
        Effect.mapError((e) =>
          makeAppError({
            code: "validation",
            message: `Temporary directory for registry install could not be created`,
            cause: e,
          }),
        ),
      );
      yield* Effect.ensuring(
        Effect.gen(function* () {
          yield* extractZip(archive, tmpDir);
          // Remove existing canonical and copy fresh
          yield* fs.remove(canonicalPath, { recursive: true }).pipe(Effect.ignore);
          yield* fs.makeDirectory(canonicalPath, { recursive: true }).pipe(
            Effect.mapError((e) =>
              makeAppError({
                code: "validation",
                message: `Failed to create canonical directory: ${canonicalPath}`,
                cause: e,
              }),
            ),
          );
          // Copy extracted files to canonical
          const entries = yield* fs.readDirectory(tmpDir).pipe(
            Effect.mapError((e) =>
              makeAppError({
                code: "validation",
                message: `Extracted directory could not be read`,
                cause: e,
              }),
            ),
          );
          yield* Effect.forEach(
            entries,
            (entry) => {
              const src = path.join(tmpDir, entry);
              const dest = path.join(canonicalPath, entry);
              return fs.copy(src, dest).pipe(Effect.ignore);
            },
            { concurrency: "unbounded" },
          );
        }),
        fs.remove(tmpDir, { recursive: true }).pipe(Effect.ignore),
      );
    }

    return canonicalPath;
  });

const REQUIRED_AGENT_IDS: ReadonlySet<AgentId> = new Set<AgentId>([
  "claude-code",
  "opencode",
  "github-copilot",
  "cursor",
  "gemini-cli",
  "codex",
]);

interface AgentOutcome {
  readonly agentId: AgentId;
  readonly outcome: McpServerSyncOutcome;
}

const summarizeAgentSync = (
  outcomes: ReadonlyArray<AgentOutcome>,
): {
  readonly status: "green" | "degraded";
  readonly details: ReadonlyArray<string>;
} => {
  const degraded = outcomes.some(
    ({ outcome }) => outcome._tag === "failed" || outcome._tag === "fallback",
  );
  const details = outcomes.map(({ agentId, outcome }) =>
    outcome._tag === "success"
      ? `${agentId}:success`
      : outcome._tag === "fallback"
        ? `${agentId}:fallback:${outcome.fallbackFrom}`
        : `${agentId}:${outcome._tag}`,
  );

  return {
    status: degraded ? "degraded" : "green",
    details,
  };
};

const syncConfiguredAgentsOnInstall = (args: {
  readonly wsBaseDir: string;
  readonly strict: boolean;
  readonly serverName: string;
  readonly canonicalPath: string;
  readonly owner: Handle;
  readonly resolvedVersion: string;
}) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const agentRepo = yield* CodingAgentRepository;

    const unknownConfiguredAgentIds = yield* agentRepo.getUnknownConfiguredAgentIds();
    if (args.strict && unknownConfiguredAgentIds.length > 0) {
      const message = `Unknown configured agents in strict mode: ${unknownConfiguredAgentIds.join(", ")}`;
      return yield* makeAppError({
        code: "not_found",
        message: message,
      });
    }

    if (unknownConfiguredAgentIds.length > 0) {
      yield* renderer.warn(
        `Skipping unknown configured agents: ${unknownConfiguredAgentIds.join(", ")}`,
      );
    }

    const configuredAgents = yield* agentRepo.getConfiguredAgents();

    const outcomes = yield* Effect.forEach(
      configuredAgents,
      (agent: CodingAgent) =>
        agent
          .addMcpServer({
            workspaceRoot: args.wsBaseDir,
            serverName: args.serverName,
            canonicalPath: args.canonicalPath,
            owner: args.owner,
            resolvedVersion: args.resolvedVersion,
          })
          .pipe(Effect.map((outcome) => ({ agentId: agent.id, outcome }))),
      { concurrency: "unbounded" },
    );

    const misconfigured = Array.filter(outcomes, ({ outcome }) => outcome._tag === "misconfigured");
    if (misconfigured.length > 0) {
      return yield* makeAppError({
        code: "internal",
        message: `MCP server ${args.serverName} could not be synced to configured agents`,
      });
    }

    const failed = Array.filter(outcomes, ({ outcome }) => outcome._tag === "failed");
    if (args.strict && failed.length > 0) {
      return yield* makeAppError({
        code: "internal",
        message: `MCP server ${args.serverName} sync failed in strict mode`,
      });
    }

    const strictDisabledFailures = Array.filter(
      outcomes,
      ({ agentId, outcome }) =>
        (outcome._tag === "disabled" ||
          (outcome._tag === "fallback" && outcome.fallbackFrom === "disabled")) &&
        args.strict &&
        REQUIRED_AGENT_IDS.has(agentId),
    );
    if (strictDisabledFailures.length > 0) {
      return yield* makeAppError({
        code: "internal",
        message: `MCP server ${args.serverName} sync disabled for required configured agents`,
      });
    }

    const warningOutcomes = Array.filter(
      outcomes,
      ({ outcome }) =>
        outcome._tag === "unsupported" ||
        outcome._tag === "disabled" ||
        outcome._tag === "failed" ||
        outcome._tag === "fallback",
    );
    if (warningOutcomes.length > 0) {
      const warningMessage = warningOutcomes
        .map(({ agentId, outcome }) =>
          outcome._tag === "success"
            ? `${agentId}:success`
            : outcome._tag === "fallback"
              ? `${agentId}:fallback(${outcome.fallbackFrom}):${outcome.reason}`
              : `${agentId}:${outcome.reason}`,
        )
        .join(", ");
      yield* renderer.warn(`MCP agent sync warnings for ${args.serverName}: ${warningMessage}`);
    }

    return summarizeAgentSync(outcomes);
  });

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Install-mcp-server operation handler.
 *
 * Registry-only: fetch archive, validate integrity, extract to canonical path,
 * then update lockfile/settings.
 */
export const installMcpServer: (
  op: InstallMcpServerOperation,
) => Effect.Effect<
  JobStepResult,
  AppError,
  FileSystem.FileSystem | Path.Path | WorkspaceMutations | CliRenderer | CodingAgentRepository
> = (op) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const renderer = yield* CliRenderer;
    const { ref } = op.args;

    if (ref.refType !== "registry") {
      return yield* makeAppError({
        code: "internal",
        message: `Unsupported ref type for MCP server install: ${ref.refType}`,
      });
    }

    const strictAgentSync = Option.getOrElse(op.args.strictAgentSync ?? Option.none(), () => false);
    const canonicalPath = yield* installFromRegistry(ref);

    yield* validateExactResolvedVersion(
      `mcpServers.${ref.server.name}.resolvedVersion`,
      ref.version,
    );

    // Build lock entry and persist
    const lockEntry = buildLockEntry(ref, new Date());
    const writeEffect = Option.getOrElse(op.args.skipSettings, () => false)
      ? ws.setMcpServerLock({ name: ref.server.name, lockEntry })
      : ws.setMcpServer({ name: ref.server.name, lockEntry });
    yield* writeEffect.pipe(
      Effect.catch((e) => renderer.warn(`MCP server update failed: ${String(e)}`)),
    );

    const agentSync = yield* syncConfiguredAgentsOnInstall({
      wsBaseDir: ws.baseDir,
      strict: strictAgentSync,
      serverName: ref.server.name,
      canonicalPath,
      owner: ref.owner,
      resolvedVersion: ref.version,
    });

    return {
      result: "success",
      message: `Installed ${ref.server.name} (canonical=success, agent-sync=${agentSync.status})`,
    } satisfies JobStepResult;
  });
