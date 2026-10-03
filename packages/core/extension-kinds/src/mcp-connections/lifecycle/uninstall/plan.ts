/**
 * Uninstalling an MCP connection.
 *
 * Runtime credentials belong to the native host and are never erased here.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import {
  DesiredStateReader,
  LockfileReader,
  WorkspaceLocation,
  type McpServerExtensionTarget,
  lockfileDisplayPath,
  settingsDisplayPath,
} from "@agentxm/workspace-kernel/workspace-state";

import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { McpServerManager } from "@agentxm/workspace-kernel/materialization";
import { mcpServerArtifact, mcpSourceTarget } from "../../artifact.js";
import {
  buildUninstallOperation,
  kernelFailureToStepFailure,
  makeWorkspaceRetentionPolicy,
  type InstallStepRequirements,
} from "@agentxm/workspace-kernel/reconciliation";
import {
  type JobStepResult,
  type Plan,
  type PlannedJobStep,
  type ExtensionLifecycleFailed,
} from "@agentxm/workspace-kernel/operations";

/** One MCP connection removal. */
export interface McpServerUninstallIntent {
  readonly targets: ReadonlyArray<McpServerExtensionTarget>;
}

/** One local connection name is removed at a time. */
export const parseMcpServerUninstallRequest = (selector: string): McpServerUninstallIntent => ({
  targets: [{ type: "mcp-server", name: selector.trim() } satisfies McpServerExtensionTarget],
});

/** The closure a settled MCP removal becomes. */
export const planMcpServerUninstall: (
  intent: McpServerUninstallIntent,
) => Effect.Effect<
  Plan<InstallStepRequirements>,
  ExtensionLifecycleFailed,
  InstallStepRequirements | McpServerManager | FileSystem.FileSystem | Path.Path
> = Effect.fn("UninstallExtensions.planMcpServers")(function* (intent: McpServerUninstallIntent) {
  const location = yield* WorkspaceLocation;
  const desiredState = yield* DesiredStateReader;
  const lockfile = yield* LockfileReader;
  const mcpServerManager = yield* McpServerManager;
  const retentionPolicy = makeWorkspaceRetentionPolicy(desiredState, kernelFailureToStepFailure);

  const steps = intent.targets.map((target): PlannedJobStep<InstallStepRequirements> => {
    const step = buildUninstallOperation(mcpServerManager, retentionPolicy, {
      toStepFailure: kernelFailureToStepFailure,
      target,
      buildArtifact: ({ settlement, unmaterialization }) =>
        Effect.succeed(
          mcpServerArtifact({
            lockEntry: undefined,
            scope: location.scope,
            change: settlement.declaration === "absent" ? "unchanged" : "removed",
            targets: [],
            nativeLocations: Option.isSome(unmaterialization)
              ? (unmaterialization.value.observation.nativeLocations ?? [])
              : [],
          }),
        ),
    });
    if (step.readiness !== "ready") return step;
    return {
      ...step,
      run: Effect.gen(function* () {
        const lockEntry = Option.getOrUndefined(
          yield* lockfile
            .acceptedEntry("mcp-server", target.name)
            .pipe(Effect.catch(() => Effect.succeed(Option.none()))),
        );
        const result = yield* step.run;
        if (result.result !== "success") return result;
        const unchanged = result.disposition === "unchanged";
        const sourceTarget =
          lockEntry?.source.type === "registry"
            ? mcpSourceTarget(location.scope, lockEntry, "removed")
            : undefined;
        return {
          ...result,
          artifact: mcpServerArtifact({
            lockEntry,
            scope: location.scope,
            nativeLocations: result.artifact?.nativeLocations ?? [],
            change: unchanged ? "unchanged" : "removed",
            targets: unchanged
              ? []
              : [
                  { path: lockfileDisplayPath(location.scope), change: "updated" },
                  { path: settingsDisplayPath(location.scope), change: "updated" },
                  ...(sourceTarget === undefined ? [] : [sourceTarget]),
                ],
          }),
        } satisfies JobStepResult;
      }),
    };
  });

  return {
    _tag: "Plan",
    name: "Uninstall MCP server",
    description: Option.some(
      `Uninstall MCP server ${intent.targets.map((target) => target.name).join(", ")}`,
    ),
    jobs: [{ concurrency: 1, steps }],
  } satisfies Plan<InstallStepRequirements>;
});
