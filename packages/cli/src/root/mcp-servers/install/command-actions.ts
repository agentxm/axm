/**
 * MCP server install workflow actions service.
 *
 * Implements InstallExtensionCommandWorkflowActions for MCP servers.
 * MCP servers are registry-only, similar to commands.
 * The live layer captures all required services at construction time
 * so action methods satisfy the `R = never` contract.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Result from "effect/Result";

import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import type { ExtensionName, Handle } from "@agentxm/client-core/unstable/extensions";
import type { RegistrySource } from "@agentxm/client-core/unstable/sources";
import {
  resolveSource,
  SourceHostProviders,
} from "@agentxm/client-core/unstable/source-resolution";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import {
  McpServerManager,
  type McpServerExtensionRef,
} from "@agentxm/client-core/unstable/mcp-servers";
import type { Plan } from "@agentxm/client-core/unstable/plan";
import { buildInstallOperation } from "@agentxm/client-core/unstable/extensions";
import type { InstallExtensionCommandWorkflowActions } from "@agentxm/client-core/unstable/workflows";
import type { InstallMcpServerCommandIntent } from "./intent.js";
import { parseRegistryInstallTarget } from "../../shared/registry-install-target.js";

// -----------------------------------------------------------------------------
// Handler Args
// -----------------------------------------------------------------------------

export interface InstallMcpServerHandlerArgs {
  readonly source: string;
}

// -----------------------------------------------------------------------------
// Parsed Args
// -----------------------------------------------------------------------------

export interface ParsedMcpServerInstallArgs {
  readonly owner: Handle;
  readonly serverName: ExtensionName;
  readonly versionConstraint: Option.Option<string>;
  readonly resolvedInput: string;
  readonly force: boolean;
}

// -----------------------------------------------------------------------------
// Source Request
// -----------------------------------------------------------------------------

export interface McpServerInstallSourceRequest {
  readonly source: RegistrySource;
  readonly owner: Handle;
  readonly serverName: ExtensionName;
  readonly versionConstraint: Option.Option<string>;
}

// -----------------------------------------------------------------------------
// Service Tag
// -----------------------------------------------------------------------------

export class InstallMcpServerCommandWorkflowActions extends ServiceMap.Service<
  InstallMcpServerCommandWorkflowActions,
  InstallExtensionCommandWorkflowActions<
    InstallMcpServerHandlerArgs,
    ParsedMcpServerInstallArgs,
    McpServerInstallSourceRequest,
    McpServerExtensionRef,
    InstallMcpServerCommandIntent
  >
>()("axm.sh/InstallMcpServerCommandWorkflowActions") {}

// -----------------------------------------------------------------------------
// Live Layer
// -----------------------------------------------------------------------------

/**
 * Constructs the actions by resolving all services at layer-build time.
 * Each action method closes over the captured services so `R = never`.
 */
export const InstallMcpServerCommandWorkflowActionsLive = Layer.effect(
  InstallMcpServerCommandWorkflowActions,
  Effect.gen(function* () {
    const sources = yield* SourceHostProviders;
    const ws = yield* WorkspaceMutations;
    const mcpServerMgr = yield* McpServerManager;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    // Build a service layer to provide to inner effects that still require
    // services via the Effect context (e.g. resolveSource).
    const envLayer = Layer.mergeAll(
      Layer.succeed(SourceHostProviders, sources),
      Layer.succeed(WorkspaceMutations, ws),
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
    );

    const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.provide(effect, envLayer);

    const parseArgs = (
      args: InstallMcpServerHandlerArgs,
    ): Effect.Effect<ParsedMcpServerInstallArgs, AppError> =>
      Effect.gen(function* () {
        const trimmed = args.source.trim();
        const parsed = parseRegistryInstallTarget(trimmed, {
          expectedType: "mcp-server",
          allowBareName: true,
        });

        if (Result.isSuccess(parsed)) {
          if (parsed.success.kind === "registry") {
            return {
              owner: parsed.success.owner,
              serverName: parsed.success.name,
              versionConstraint: Option.fromUndefinedOr(parsed.success.versionConstraint),
              resolvedInput: trimmed,
              force: false,
            };
          }

          const owner = yield* ws.getConfiguredOwner().pipe(
            Effect.flatMap(
              Option.match({
                onNone: () =>
                  Effect.fail(
                    makeAppError({
                      code: "OWNER_REQUIRED",
                      what: `Cannot resolve bare MCP server name "${parsed.success.name}" without a configured owner`,
                      howToFix:
                        "Use the fully-qualified `@owner/mcp-servers/${name}` form, set `owner` in `.axm/settings.json`, or run `axm login`.",
                    }),
                  ),
                onSome: Effect.succeed,
              }),
            ),
          );
          return {
            owner,
            serverName: parsed.success.name,
            versionConstraint: Option.none<string>(),
            resolvedInput: `${owner}/mcp-servers/${parsed.success.name}`,
            force: false,
          };
        }

        switch (parsed.failure.kind) {
          case "wrong-type":
            return yield* makeAppError({
              code: "MCP_SERVER_SOURCE_INVALID_FORMAT",
              what: "MCP server source must include /mcp-servers/ segment",
              details: [`Provided: ${trimmed}`],
              howToFix: "Use @owner/mcp-servers/server-name format.",
            });
          case "missing-name":
            return yield* makeAppError({
              code: "MCP_SERVER_SOURCE_MISSING_NAME",
              what: "MCP server source must include a server name",
              details: [`Provided: ${trimmed}`],
              howToFix: "Use @owner/mcp-servers/server-name format.",
            });
          default:
            return yield* makeAppError({
              code: "MCP_SERVER_SOURCE_NOT_REGISTRY",
              what: "MCP servers can only be installed from a registry",
              details: [`Provided: ${trimmed}`],
              howToFix: "Use @owner/mcp-servers/server-name or just server-name.",
            });
        }
      });

    const resolveSourceRequests = (
      parsed: ParsedMcpServerInstallArgs,
    ): Effect.Effect<ReadonlyArray<McpServerInstallSourceRequest>, AppError> =>
      provide(
        Effect.gen(function* () {
          const source = yield* resolveSource(parsed.resolvedInput).pipe(
            Effect.mapError((error) =>
              makeAppError({
                code: "INVALID_SOURCE",
                what: `Invalid source: ${error.message}`,
                details: [`Provided: ${parsed.resolvedInput}`],
                howToFix: "Use @owner/mcp-servers/server-name or just server-name.",
                cause: error,
              }),
            ),
          );

          if (source.type !== "registry") {
            return yield* makeAppError({
              code: "MCP_SERVER_SOURCE_NOT_REGISTRY",
              what: "MCP servers can only be installed from a registry",
              details: [`Provided source type: ${source.type}`],
              howToFix: "Use a registry source: @owner/mcp-servers/server-name",
            });
          }

          return [
            {
              source,
              owner: parsed.owner,
              serverName: parsed.serverName,
              versionConstraint: parsed.versionConstraint,
            },
          ];
        }),
      );

    const discoverRefs = (
      reqs: ReadonlyArray<McpServerInstallSourceRequest>,
    ): Effect.Effect<ReadonlyArray<McpServerExtensionRef>, AppError> =>
      Effect.scoped(
        Effect.gen(function* () {
          const allRefs = yield* Effect.forEach(
            reqs,
            (req) =>
              sources
                .find(req.source, {
                  names: [req.serverName],
                  type: "mcp-server",
                  owner: Option.some(req.owner),
                  versionConstraint: req.versionConstraint,
                })
                .pipe(
                  Effect.mapError((error) =>
                    makeAppError({
                      code: "MCP_SERVER_FETCH_FAILED",
                      what: "Failed to fetch MCP server from registry",
                      details: [`Server: ${req.owner}/mcp-servers/${req.serverName}`],
                      howToFix: "Verify the server name and registry configuration.",
                      cause: error,
                    }),
                  ),
                ),
            { concurrency: "unbounded" },
          );
          return allRefs
            .flat()
            .filter((ref): ref is McpServerExtensionRef => ref.type === "mcp-server");
        }),
      );

    const finalizeIntent = (
      parsed: ParsedMcpServerInstallArgs,
      refs: ReadonlyArray<McpServerExtensionRef>,
    ): Effect.Effect<InstallMcpServerCommandIntent, AppError> =>
      Effect.gen(function* () {
        if (refs.length === 0) {
          return yield* makeAppError({
            code: "MCP_SERVER_NOT_FOUND",
            what: `MCP server "${parsed.serverName}" not found in registry`,
            howToFix: "Verify the server name and check available MCP servers.",
          });
        }
        const [ref] = refs;
        if (ref === undefined) {
          return yield* makeAppError({
            code: "MCP_SERVER_NOT_FOUND",
            what: `MCP server "${parsed.serverName}" not found in registry`,
            howToFix: "Verify the server name and check available MCP servers.",
          });
        }
        return {
          ref,
          versionConstraint: parsed.versionConstraint,
          force: parsed.force,
        };
      });

    const buildPlan = (intent: InstallMcpServerCommandIntent): Effect.Effect<Plan, AppError> =>
      Effect.succeed({
        _tag: "Plan",
        name: "Install MCP server",
        description: Option.some(`Install MCP server ${intent.ref.server.name}`),
        jobs: [
          {
            concurrency: 1 as const,
            steps: [
              buildInstallOperation(mcpServerMgr, {
                ref: intent.ref,
                versionConstraint: intent.versionConstraint,
              }),
            ],
          },
        ],
      } satisfies Plan);

    return {
      parseArgs,
      resolveSourceRequests,
      discoverRefs,
      finalizeIntent,
      buildPlan,
    };
  }),
);
