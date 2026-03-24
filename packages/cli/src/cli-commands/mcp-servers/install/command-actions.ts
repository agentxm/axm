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
import * as ServiceMap from "effect/ServiceMap";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { Input } from "../../../input/index.js";
import { CliFlags } from "../../../cli-flags/index.js";
import { makeAppError, type AppError } from "../../../app-error/index.js";
import type { PromptCancelled } from "../../../prompt-cancelled.js";
import { parseInputPattern, resolveSource, SourceHostProviders } from "../../../sources/index.js";
import type { McpServerExtensionRef, RegistrySource } from "../../../sources/types.js";
import { Workspace } from "../../../workspace/service.js";
import { McpServerManager } from "../../../extensions/mcp-servers/manager.js";
import type { Plan } from "../../../workspace/plan.js";
import { buildInstallOperation } from "../../../workflows/install-operation/index.js";
import type { InstallExtensionCommandWorkflowActions } from "../../../workflows/install-command/index.js";
import type { WorkspaceScope } from "../../../workspace/scope.js";
import type { InstallMcpServerCommandIntent } from "./intent.js";

// -----------------------------------------------------------------------------
// Handler Args
// -----------------------------------------------------------------------------

export interface InstallMcpServerHandlerArgs {
  readonly source: string;
  readonly scope: WorkspaceScope;
}

// -----------------------------------------------------------------------------
// Parsed Args
// -----------------------------------------------------------------------------

export interface ParsedMcpServerInstallArgs {
  readonly namespace: string;
  readonly serverName: string;
  readonly versionConstraint: Option.Option<string>;
  readonly resolvedInput: string;
  readonly force: boolean;
}

// -----------------------------------------------------------------------------
// Source Request
// -----------------------------------------------------------------------------

export interface McpServerInstallSourceRequest {
  readonly source: RegistrySource;
  readonly namespace: string;
  readonly serverName: string;
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
>()("@axm.sh/cli/InstallMcpServerCommandWorkflowActions") {}

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
    const ws = yield* Workspace;
    const mcpServerMgr = yield* McpServerManager;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const input = yield* Input;
    const flags = yield* CliFlags;

    // Build a service layer to provide to inner effects that still require
    // services via the Effect context (e.g. resolveSource).
    const envLayer = Layer.mergeAll(
      Layer.succeed(SourceHostProviders, sources),
      Layer.succeed(Workspace, ws),
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
      Layer.succeed(Input, input),
      Layer.succeed(CliFlags, flags),
    );

    const provide = <A, E>(
      effect: Effect.Effect<
        A,
        E,
        SourceHostProviders | Workspace | FileSystem.FileSystem | Path.Path | Input | CliFlags
      >,
    ): Effect.Effect<A, E, never> => Effect.provide(effect, envLayer);

    const parseArgs = (
      args: InstallMcpServerHandlerArgs,
    ): Effect.Effect<ParsedMcpServerInstallArgs, AppError> =>
      Effect.gen(function* () {
        const trimmed = args.source.trim();
        const parsed = parseInputPattern(trimmed);

        // Handle @namespace/mcp-servers/name[@version]
        if (Option.isSome(parsed) && parsed.value.pattern.pattern === "registry-pattern-input") {
          const pat = parsed.value.pattern;
          if (Option.isSome(pat.type) && pat.type.value !== "mcp-servers") {
            return yield* makeAppError({
              code: "MCP_SERVER_SOURCE_INVALID_FORMAT",
              what: "MCP server source must include /mcp-servers/ segment",
              details: [`Provided: ${trimmed}`],
              howToFix: "Use @namespace/mcp-servers/server-name format.",
            });
          }
          if (Option.isNone(pat.name)) {
            return yield* makeAppError({
              code: "MCP_SERVER_SOURCE_MISSING_NAME",
              what: "MCP server source must include a server name",
              details: [`Provided: ${trimmed}`],
              howToFix: "Use @namespace/mcp-servers/server-name format.",
            });
          }
          return {
            namespace: pat.namespace,
            serverName: pat.name.value,
            versionConstraint: pat.versionConstraint,
            resolvedInput: trimmed,
            force: flags.force,
          };
        }

        // Handle bare name (e.g., "my-server")
        if (Option.isSome(parsed) && parsed.value.pattern.pattern === "name-input") {
          const namespace = yield* ws.getConfiguredNamespace();
          return {
            namespace,
            serverName: parsed.value.pattern.name,
            versionConstraint: Option.none<string>(),
            resolvedInput: `${namespace}/mcp-servers/${parsed.value.pattern.name}`,
            force: flags.force,
          };
        }

        return yield* makeAppError({
          code: "MCP_SERVER_SOURCE_NOT_REGISTRY",
          what: "MCP servers can only be installed from a registry",
          details: [`Provided: ${trimmed}`],
          howToFix: "Use @namespace/mcp-servers/server-name or just server-name.",
        });
      });

    const resolveSourceRequests = (
      parsed: ParsedMcpServerInstallArgs,
    ): Effect.Effect<ReadonlyArray<McpServerInstallSourceRequest>, AppError | PromptCancelled> =>
      provide(
        Effect.gen(function* () {
          const source = yield* resolveSource(parsed.resolvedInput).pipe(
            Effect.mapError((error) =>
              makeAppError({
                code: "INVALID_SOURCE",
                what: `Invalid source: ${error.message}`,
                details: [`Provided: ${parsed.resolvedInput}`],
                howToFix: "Use @namespace/mcp-servers/server-name or just server-name.",
                cause: error,
              }),
            ),
          );

          if (source.type !== "registry") {
            return yield* makeAppError({
              code: "MCP_SERVER_SOURCE_NOT_REGISTRY",
              what: "MCP servers can only be installed from a registry",
              details: [`Provided source type: ${source.type}`],
              howToFix: "Use a registry source: @namespace/mcp-servers/server-name",
            });
          }

          return [
            {
              source,
              namespace: parsed.namespace,
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
                  skillNames: [req.serverName],
                  type: "mcp-server",
                  namespace: Option.some(req.namespace),
                  versionConstraint: req.versionConstraint,
                })
                .pipe(
                  Effect.mapError((error) =>
                    makeAppError({
                      code: "MCP_SERVER_FETCH_FAILED",
                      what: "Failed to fetch MCP server from registry",
                      details: [`Server: ${req.namespace}/mcp-servers/${req.serverName}`],
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
        return {
          ref: refs[0]!,
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
