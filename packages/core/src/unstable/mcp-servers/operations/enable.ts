/**
 * Enable MCP server executor.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { CodingAgentRepository } from "../../agents/index.js";
import { CliRenderer } from "../../cli-renderer/index.js";
import {
  EXTERNAL_EXTENSIONS_DIR,
  REGISTRY_EXTENSIONS_DIR,
  normalizeHandle,
} from "../../extensions/index.js";
import { makeAppError, type AppError } from "../../app-error/index.js";
import type { JobStepResult, Operation } from "../../plan/plan.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import type { McpServerLockEntry } from "../../lockfile/index.js";

export type EnableMcpServerOperation = Operation<
  "enable-mcp-server",
  { readonly serverName: string }
>;

const canonicalPathFor = (
  path: Path.Path,
  base: string,
  name: string,
  lockEntry: McpServerLockEntry,
): string =>
  lockEntry.type === "registry"
    ? path.join(base, REGISTRY_EXTENSIONS_DIR, lockEntry.owner, "mcp-servers", lockEntry.name)
    : path.join(base, EXTERNAL_EXTENSIONS_DIR, "mcp-servers", name);

export const enableMcpServer = (
  op: EnableMcpServerOperation,
): Effect.Effect<
  JobStepResult,
  AppError,
  FileSystem.FileSystem | Path.Path | WorkspaceMutations | CodingAgentRepository | CliRenderer
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;
    const agentRepo = yield* CodingAgentRepository;
    const renderer = yield* CliRenderer;

    const configured = yield* ws.getConfiguredMcpServerEntries();
    const entry = configured[op.args.serverName];
    if (entry === undefined) {
      return yield* makeAppError({
        code: "not_found",
        detail: `MCP server "${op.args.serverName}" not found in settings`,
      });
    }

    yield* ws.updateMcpServerEntry(op.args.serverName, (current) => ({
      ...current,
      enabled: true,
    }));

    const lockEntry = yield* ws.getLockedMcpServer(op.args.serverName);
    if (Option.isNone(lockEntry)) {
      return { result: "success", message: `Enabled ${op.args.serverName}` };
    }

    const canonicalPath = canonicalPathFor(path, ws.baseDir, op.args.serverName, lockEntry.value);
    const exists = yield* fs.exists(canonicalPath).pipe(Effect.catch(() => Effect.succeed(false)));
    if (!exists) {
      return yield* makeAppError({
        code: "not_found",
        detail: `MCP server files for "${op.args.serverName}" not found at ${canonicalPath}`,
      });
    }

    const agents = yield* agentRepo.getConfiguredAgents();
    const outcomes = yield* Effect.forEach(
      agents,
      (agent) =>
        agent.addMcpServer({
          workspaceRoot: ws.baseDir,
          scope: ws.scope,
          serverName: op.args.serverName,
          canonicalPath,
          owner:
            lockEntry.value.type === "registry" ? lockEntry.value.owner : normalizeHandle("@local"),
          resolvedVersion:
            lockEntry.value.type === "registry" ? lockEntry.value.resolvedVersion : "0.0.0",
          enabled: true,
          configValues: entry.env,
        }),
      { concurrency: "unbounded" },
    );
    const warnings = outcomes.filter((outcome) => outcome._tag !== "success");
    if (warnings.length > 0) {
      yield* renderer.warn(
        `MCP agent sync warnings for ${op.args.serverName}: ${warnings
          .map((outcome) => outcome.reason)
          .join(", ")}`,
      );
    }

    return { result: "success", message: `Enabled ${op.args.serverName}` };
  });
