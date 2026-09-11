/**
 * Uninstalling an MCP connection.
 *
 * Removing a connection also removes the secrets it stored in the operating
 * system keychain, because those inputs exist only for that connection. A
 * keychain that refuses the deletion does not fail the removal — AXM state is
 * already applied — but it is reported, because a credential left behind is
 * something the operator has to finish by hand.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import {
  McpServerManager,
  buildUninstallOperation,
  collectSecretInputNames,
  deleteMcpSecrets,
  mcpServerArtifact,
  mcpSourceTarget,
  readMcpServerManifest,
} from "@agentxm/extension-materialization";
import {
  appendWarningsToMessage,
  type JobStepResult,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/workspace-operations";
import {
  WorkspaceMutations,
  acceptedLockedCanonicalPath,
  type McpServerExtensionTarget,
} from "@agentxm/workspace-state";

import type { ExtensionLifecycleFailed } from "../../errors.js";
import { lifecycleStepFailure } from "../../step-failure.js";
import type { InstallStepRequirements } from "../../install/vocabulary.js";
import { makeWorkspaceRetentionPolicy } from "../../uninstall/retention-policy.js";
import type { McpServerUninstallIntent } from "../../uninstall/vocabulary.js";
import { workspaceLockfilePath, workspaceSettingsPath } from "../../workspace-paths.js";

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
  const ws = yield* WorkspaceMutations;
  const mcpServerManager = yield* McpServerManager;
  const path = yield* Path.Path;
  const retentionPolicy = makeWorkspaceRetentionPolicy(ws);

  const steps = intent.targets.map((target): PlannedJobStep<InstallStepRequirements> => {
    const step = buildUninstallOperation(mcpServerManager, retentionPolicy, {
      toStepFailure: lifecycleStepFailure,
      target,
    });
    if (step.readiness !== "ready") return step;
    return {
      ...step,
      run: Effect.gen(function* () {
        const graph = yield* ws
          .getDesiredStateGraph()
          .pipe(Effect.catch(() => Effect.succeed(undefined)));
        const desiredNode = graph?.nodes.find(
          (node) => node.type === "mcp-server" && node.name === target.name,
        );
        const lockEntry = Option.getOrUndefined(
          yield* ws
            .getLockedMcpServerForConnection(target.name)
            .pipe(Effect.catch(() => Effect.succeed(Option.none()))),
        );
        const canonicalPath = yield* acceptedLockedCanonicalPath({
          workspace: ws,
          type: "mcp-server",
          name: target.name,
        }).pipe(Effect.catch(() => Effect.succeed(Option.none())));
        const manifest = yield* Option.match(canonicalPath, {
          onNone: () => Effect.succeed(Option.none()),
          onSome: (root) => readMcpServerManifest(root),
        });
        const result = yield* step.run;
        if (result.result !== "success") return result;
        const unchanged = result.disposition === "unchanged";
        const secretNames = Option.match(manifest, {
          onNone: () => new Set<string>(),
          onSome: collectSecretInputNames,
        });
        const secretDeletionWarnings =
          unchanged || desiredNode === undefined || desiredNode.authority === "inline"
            ? []
            : (yield* deleteMcpSecrets(
                {
                  scopeRoot: path.resolve(ws.baseDir),
                  localName: target.name,
                  sourceIdentity: desiredNode.identity,
                },
                secretNames,
              )).flatMap((outcome) =>
                outcome._tag === "failed"
                  ? [
                      `${outcome.inputName} could not be deleted from the system keychain; AXM state was applied and credential cleanup is required`,
                    ]
                  : [],
              );
        const sourceTarget =
          lockEntry?.type === "registry"
            ? mcpSourceTarget(ws.scope, lockEntry, "removed")
            : undefined;
        return {
          ...result,
          message: appendWarningsToMessage(result.message, secretDeletionWarnings),
          ...(secretDeletionWarnings.length === 0
            ? {}
            : { warnings: [...(result.warnings ?? []), ...secretDeletionWarnings] }),
          artifact: mcpServerArtifact({
            lockEntry,
            scope: ws.scope,
            change: unchanged ? "unchanged" : "removed",
            targets: unchanged
              ? []
              : [
                  { path: workspaceLockfilePath(ws.scope), change: "updated" },
                  { path: workspaceSettingsPath(ws.scope), change: "updated" },
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
