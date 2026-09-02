/**
 * MCP server uninstall workflow actions service.
 *
 * Implements UninstallExtensionCommandWorkflowActions for MCP servers.
 * The live layer captures all required services at construction time
 * so action methods satisfy the `R = never` contract.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { failureToStepFailure } from "../../../app-error/conversions.js";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type { AppError } from "../../../app-error/index.js";
import {
  acceptedLockedCanonicalPath,
  WorkspaceMutations,
  type McpServerExtensionTarget,
} from "@agentxm/workspace-state";
import { type McpServerExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
import {
  collectSecretInputNames,
  deleteMcpSecrets,
  mcpServerArtifact,
  mcpSourceTarget,
  readMcpServerManifest,
} from "@agentxm/extension-lifecycle";
import type { JobStepResult, Plan, PlannedJobStep } from "@agentxm/workspace-operations";
import { appendWarningsToMessage } from "@agentxm/workspace-operations";
import { buildUninstallOperation } from "@agentxm/extension-workspace";
import type { UninstallExtensionCommandWorkflowActions } from "@agentxm/extension-lifecycle";
import type { UninstallMcpServerCommandIntent } from "./intent.js";
import { makeWorkspaceRetentionPolicy } from "../../shared/workspace-retention-policy.js";
import {
  workspaceLockfilePath,
  workspaceSettingsPath,
} from "../../shared/workspace-display-paths.js";
import { McpServerManager } from "@agentxm/extension-workspace";

// -----------------------------------------------------------------------------
// Handler Args
// -----------------------------------------------------------------------------

export interface UninstallMcpServerHandlerArgs {
  readonly serverName: string;
}

// -----------------------------------------------------------------------------
// Parsed Args
// -----------------------------------------------------------------------------

export interface ParsedMcpServerUninstallArgs {
  readonly serverName: string;
}

type UninstallMcpServerActions = UninstallExtensionCommandWorkflowActions<
  UninstallMcpServerHandlerArgs,
  ParsedMcpServerUninstallArgs,
  UninstallMcpServerCommandIntent,
  AppError
>;

export const UninstallMcpServerCommandWorkflowActions = Effect.gen(function* () {
  const ws = yield* WorkspaceMutations;
  const mcpServerMgr = yield* McpServerManager;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const parseArgs = (
    args: UninstallMcpServerHandlerArgs,
  ): Effect.Effect<ParsedMcpServerUninstallArgs, AppError> =>
    Effect.succeed({ serverName: args.serverName.trim() });

  const finalizeIntent = (
    parsed: ParsedMcpServerUninstallArgs,
  ): Effect.Effect<UninstallMcpServerCommandIntent, AppError> =>
    Effect.succeed({
      targets: [
        {
          type: "mcp-server",
          name: parsed.serverName,
        } satisfies McpServerExtensionTarget,
      ],
    });

  const buildUninstallPlan = (
    intent: UninstallMcpServerCommandIntent,
  ): Effect.Effect<Plan, AppError> => {
    const retentionPolicy = makeWorkspaceRetentionPolicy(ws);

    const steps = intent.targets.map((target): PlannedJobStep => {
      const step = buildUninstallOperation<McpServerExtensionRef, AppError>(
        mcpServerMgr,
        retentionPolicy,
        {
          toStepFailure: failureToStepFailure,
          target,
        },
      );
      if (step.readiness !== "ready") {
        return step;
      }
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
          }).pipe(
            Effect.provideService(Path.Path, path),
            Effect.catch(() => Effect.succeed(Option.none())),
          );
          const manifest = yield* Option.match(canonicalPath, {
            onNone: () => Effect.succeed(Option.none()),
            onSome: (root) =>
              readMcpServerManifest(root).pipe(
                Effect.provideService(FileSystem.FileSystem, fs),
                Effect.provideService(Path.Path, path),
              ),
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
              : {
                  warnings: [...(result.warnings ?? []), ...secretDeletionWarnings],
                }),
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

    return Effect.succeed({
      _tag: "Plan",
      name: "Uninstall MCP server",
      description: Option.some(
        `Uninstall MCP server ${intent.targets.map((t) => t.name).join(", ")}`,
      ),
      jobs: [{ concurrency: 1 as const, steps }],
    } satisfies Plan);
  };

  return {
    parseArgs,
    finalizeIntent,
    buildUninstallPlan,
  };
}).pipe(Effect.map((actions): UninstallMcpServerActions => actions));
