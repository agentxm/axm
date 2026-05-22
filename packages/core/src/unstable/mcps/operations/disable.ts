/**
 * Disable MCP server executor.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { CodingAgentRepository } from "../../agents/index.js";
import { CliRenderer } from "../../cli-renderer/index.js";
import { makeAppError, type AppError } from "../../app-error/index.js";
import type { JobStepResult, Operation } from "../../plan/plan.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";

export type DisableMcpServerOperation = Operation<
  "disable-mcp-server",
  { readonly serverName: string }
>;

export const disableMcpServer = (
  op: DisableMcpServerOperation,
): Effect.Effect<
  JobStepResult,
  AppError,
  FileSystem.FileSystem | Path.Path | WorkspaceMutations | CodingAgentRepository | CliRenderer
> =>
  Effect.gen(function* () {
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

    const lockEntry = yield* ws.getLockedMcpServer(op.args.serverName);
    if (Option.isSome(lockEntry)) {
      const agents = yield* agentRepo.getConfiguredAgents();
      const outcomes = yield* Effect.forEach(
        agents,
        (agent) =>
          agent.removeMcpServer({
            workspaceRoot: ws.baseDir,
            scope: ws.scope,
            serverName: op.args.serverName,
            disableOnly: true,
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
    }

    yield* ws.updateMcpServerEntry(op.args.serverName, (current) => ({
      ...current,
      enabled: false,
    }));

    return { result: "success", message: `Disabled ${op.args.serverName}` };
  });
