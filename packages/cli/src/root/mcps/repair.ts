import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { syncInlineMcpServerToAgents } from "@agentxm/client-core/unstable/agents";
import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import { previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import {
  publicRecoveryValue,
  recoveryPositional,
  withArgvTracking,
} from "@agentxm/client-core/unstable/cli-runtime";
import { inspectMcpServerAcrossAgents } from "@agentxm/client-core/unstable/mcps";
import type {
  JobStepArtifact,
  JobStepResult,
  Plan,
  PlanResolution,
} from "@agentxm/client-core/unstable/plan";
import type { McpServerEntry } from "@agentxm/client-core/unstable/settings";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { scopeFlag } from "../../cli-flags.js";
import { emitPlanResolutionResult } from "../../json-output.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { previewOrApplyLocalPlan } from "../shared/local-plan.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";
import { makeConfirmationRecovery } from "../shared/confirmation-recovery.js";

const isInlineMcpServerEntry = (entry: McpServerEntry): boolean =>
  entry.source === "inline" && (entry.command !== undefined || entry.url !== undefined);

export const handleRepairMcpServer = Effect.fn("Mcps.repair")(function* (args: {
  readonly name: string;
  readonly yes: boolean;
  readonly preview: boolean;
}) {
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const configured = yield* ws.getConfiguredMcpServerEntries();
  const entry = configured[args.name];
  if (entry === undefined) {
    return yield* makeAppError({
      code: "not_found",
      detail: `MCP server "${args.name}" is not configured`,
    });
  }
  if (!isInlineMcpServerEntry(entry)) {
    return yield* makeAppError({
      code: "usage",
      detail: `MCP server "${args.name}" is not inline; reinstall its declared source to repair it`,
    });
  }
  if (!entry.enabled) {
    return yield* makeAppError({
      code: "conflict",
      detail: `MCP server "${args.name}" is disabled and should not be materialized`,
    });
  }

  const configuredAgents = yield* ws.getConfiguredAgents();
  const inspections = yield* inspectMcpServerAcrossAgents({
    workspaceRoot: ws.baseDir,
    scope: ws.scope,
    agentIds: configuredAgents,
    serverName: args.name,
    entry,
  });
  const targets = inspections.filter(
    (inspection) => inspection.status !== "match" && inspection.status !== "unsupported",
  );
  if (targets.length === 0) {
    yield* emitNoOpOutcome("mcps.repair", {
      planName: "Repair MCP server native config",
      message: `MCP server "${args.name}" native config is already current`,
    });
    return;
  }

  const targetPaths = [...new Set(targets.map((target) => target.absolutePath))].sort();
  const targetAgentIds = targets.map((target) => target.agentId);
  const provideFsPath = <A>(
    effect: Effect.Effect<A, AppError, FileSystem.FileSystem | Path.Path>,
  ) =>
    effect.pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    );
  const artifact = {
    path: "native MCP config targets",
    scope: ws.scope,
    change: "updated",
    fileCount: targetPaths.length,
    targets: targets.map((target) => ({
      path: target.path,
      change: "updated",
      agentIds: [target.agentId],
    })),
  } satisfies JobStepArtifact;
  const run = ws
    .runTransaction({
      targets: targetPaths,
      transition: provideFsPath(
        syncInlineMcpServerToAgents(targetAgentIds, {
          workspaceRoot: ws.baseDir,
          serverName: args.name,
          entry,
          scope: ws.scope,
        }),
      ),
      validate: () =>
        provideFsPath(
          inspectMcpServerAcrossAgents({
            workspaceRoot: ws.baseDir,
            scope: ws.scope,
            agentIds: targetAgentIds,
            serverName: args.name,
            entry,
          }).pipe(
            Effect.flatMap((observed) =>
              observed.every(
                (inspection) =>
                  inspection.status === "match" || inspection.status === "unsupported",
              )
                ? Effect.void
                : makeAppError({
                    code: "internal",
                    detail: `MCP server "${args.name}" repair did not reach the desired native config`,
                  }),
            ),
          ),
        ),
      receipt: () => Effect.void,
    })
    .pipe(
      Effect.as({
        result: "success",
        message: `Repaired MCP server ${args.name} in ${targetPaths.length} native config target${targetPaths.length === 1 ? "" : "s"}`,
        artifact,
      } satisfies JobStepResult),
    );
  const plan: Plan = {
    _tag: "Plan",
    name: "Repair MCP server native config",
    description: Option.some(`Replace the exact drifted native targets for ${args.name}`),
    jobs: [
      {
        concurrency: 1,
        steps: [
          {
            key: `mcp-server:repair:${args.name}`,
            readiness: "ready",
            label: `Repair MCP server ${args.name}`,
            artifact,
            run,
          },
        ],
      },
    ],
  };
  const resolution: PlanResolution = yield* previewOrApplyLocalPlan(plan, {
    preview: args.preview,
    yes: args.yes,
    recovery: makeConfirmationRecovery(
      ["mcps", "repair"],
      [recoveryPositional(publicRecoveryValue(args.name))],
    ),
    displayApplied: false,
  });
  yield* emitPlanResolutionResult("mcps.repair", resolution);
});

const repairConfig = {
  name: Argument.string("name").pipe(
    Argument.withDescription("Configured inline MCP server name to repair"),
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Repair project (default) or user-level native configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Apply the exact-target repair without confirmation")),
  preview: previewFlag.pipe(
    Flag.withDescription("Show the exact native config targets without changing them"),
  ),
};

export const repairCommand = Command.make("repair", repairConfig, ({ name, scope, yes, preview }) =>
  handleRepairMcpServer({ name, yes, preview }).pipe(
    withWorkspace(scope),
    withRuntime("mcps repair"),
  ),
).pipe(
  withArgvTracking(repairConfig),
  Command.withDescription("Repair drifted native config for one inline MCP server"),
  Command.withExamples([
    {
      command: "axm mcps repair context --preview",
      description: "Preview the exact native MCP config targets that would be replaced",
    },
  ]),
);
