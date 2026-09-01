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
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as HttpClient from "effect/unstable/http/HttpClient";

import { makeAppError, type AppError } from "@agentxm/extension-management/unstable/app-error";
import type { ExtensionName, Handle } from "@agentxm/extension-model/unstable/extensions";
import type { RegistrySource } from "@agentxm/extension-model/unstable/sources/types";
import {
  resolveSource,
  SourceHostProviders,
} from "@agentxm/extension-management/unstable/source-resolution";
import {
  WorkspaceMutations,
  type McpServerExtensionRef,
} from "@agentxm/extension-management/unstable/workspace";
import { installMcpServer } from "@agentxm/extension-management/unstable/mcps";
import { CodingAgentRepository } from "@agentxm/extension-management/unstable/agents";
import {
  CONFIGURABLE_AGENTS_BY_ID,
  type ConfigurableAgentId,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import { CliRenderer } from "@agentxm/extension-management/unstable/cli-renderer";
import type { Plan } from "@agentxm/extension-management/unstable/plan";
import type { InstallExtensionCommandWorkflowActions } from "@agentxm/extension-management/unstable/extension-lifecycle";
import { isNonInteractiveOptional } from "@agentxm/extension-management/unstable/cli-flags";
import type { InstallMcpServerCommandIntent } from "./intent.js";
import { parseRegistryInstallTarget } from "../../shared/registry-install-target.js";
import { makeRegistryLoginSuggestionResolver } from "../../shared/registry-login-suggestion.js";
import { toAppError } from "@agentxm/extension-management/unstable/app-error/conversions";

// -----------------------------------------------------------------------------
// Handler Args
// -----------------------------------------------------------------------------

export interface InstallMcpServerHandlerArgs {
  readonly source: string;
  readonly env?: ReadonlyArray<string>;
  readonly agents?: ReadonlyArray<ConfigurableAgentId>;
}

// -----------------------------------------------------------------------------
// Parsed Args
// -----------------------------------------------------------------------------

export interface ParsedMcpServerInstallArgs {
  readonly owner: Handle;
  readonly serverName: ExtensionName;
  readonly versionRange: Option.Option<string>;
  readonly resolvedInput: string;
  readonly force: boolean;
  readonly env: Readonly<Record<string, string>>;
  readonly agents?: ReadonlyArray<ConfigurableAgentId>;
}

// -----------------------------------------------------------------------------
// Source Request
// -----------------------------------------------------------------------------

export interface McpServerInstallSourceRequest {
  readonly source: RegistrySource;
  readonly owner: Handle;
  readonly serverName: ExtensionName;
  readonly versionRange: Option.Option<string>;
}

type InstallMcpServerActions = InstallExtensionCommandWorkflowActions<
  InstallMcpServerHandlerArgs,
  ParsedMcpServerInstallArgs,
  McpServerInstallSourceRequest,
  McpServerExtensionRef,
  InstallMcpServerCommandIntent
>;

/**
 * Decode repeated `--env KEY=VALUE` flags into a record. Later occurrences of
 * the same key win. Registry installs resolve declared inputs by name, so a
 * bare `KEY` (passthrough from the ambient environment, as `axm mcps add`
 * allows) is rejected here rather than silently resolving to nothing.
 */
export const parseEnvFlag = (
  env: ReadonlyArray<string>,
): Effect.Effect<Readonly<Record<string, string>>, AppError> =>
  Effect.gen(function* () {
    const parsed: Record<string, string> = {};
    for (const value of env) {
      const separator = value.indexOf("=");
      if (separator <= 0) {
        return yield* makeAppError({
          code: "usage",
          detail: "--env must use KEY=VALUE format",
        });
      }
      parsed[value.slice(0, separator)] = value.slice(separator + 1);
    }
    return parsed;
  });

const isConfigurableAgentId = (agentId: string): agentId is ConfigurableAgentId =>
  agentId in CONFIGURABLE_AGENTS_BY_ID;

export const InstallMcpServerCommandWorkflowActions = Effect.gen(function* () {
  const sources = yield* SourceHostProviders;
  const httpClient = yield* HttpClient.HttpClient;
  const ws = yield* WorkspaceMutations;
  const renderer = yield* CliRenderer;
  const agentRepo = yield* CodingAgentRepository;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const loginSuggestionsFor = yield* makeRegistryLoginSuggestionResolver;

  const registryLoginSuggestions = ws
    .getRegistrySourceHosts()
    .pipe(Effect.mapError(toAppError))
    .pipe(Effect.flatMap((hosts) => loginSuggestionsFor(hosts.map((host) => host.location.href))));

  // Build a service layer to provide to inner effects that still require
  // services via the Effect context (e.g. resolveSource).
  const envLayer = Layer.mergeAll(
    Layer.succeed(SourceHostProviders, sources),
    Layer.succeed(HttpClient.HttpClient, httpClient),
    Layer.succeed(WorkspaceMutations, ws),
    Layer.succeed(FileSystem.FileSystem, fs),
    Layer.succeed(Path.Path, path),
    Layer.succeed(CliRenderer, renderer),
    Layer.succeed(CodingAgentRepository, agentRepo),
  );

  const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.provide(effect, envLayer);

  const parseArgs = (
    args: InstallMcpServerHandlerArgs,
  ): Effect.Effect<ParsedMcpServerInstallArgs, AppError> =>
    Effect.gen(function* () {
      const trimmed = args.source.trim();
      const env = yield* parseEnvFlag(args.env ?? []);
      const parsed = parseRegistryInstallTarget(trimmed, {
        expectedType: "mcp-server",
        allowBareName: true,
      });

      if (Result.isSuccess(parsed)) {
        if (parsed.success.kind === "registry") {
          return {
            owner: parsed.success.owner,
            serverName: parsed.success.name,
            versionRange: Option.fromUndefinedOr(parsed.success.versionRange),
            resolvedInput: trimmed,
            force: false,
            env,
            ...(args.agents === undefined ? {} : { agents: args.agents }),
          };
        }

        const owner = yield* ws
          .getConfiguredOwner()
          .pipe(Effect.mapError(toAppError))
          .pipe(
            Effect.flatMap(
              Option.match({
                onNone: () =>
                  Effect.fail(
                    makeAppError({
                      code: "validation",
                      detail: `Cannot resolve bare MCP server name "${parsed.success.name}" without a configured owner`,
                      suggestions: [
                        {
                          description:
                            "Use the fully-qualified `@owner/mcps/name` form, set `owner` in settings, or sign in.",
                          cmd: "axm login",
                        },
                      ],
                    }),
                  ),
                onSome: Effect.succeed,
              }),
            ),
          );
        return {
          owner,
          serverName: parsed.success.name,
          versionRange: Option.none<string>(),
          resolvedInput: `${owner}/mcps/${parsed.success.name}`,
          force: false,
          env,
          ...(args.agents === undefined ? {} : { agents: args.agents }),
        };
      }

      switch (parsed.failure.kind) {
        case "wrong-type":
          return yield* makeAppError({
            code: "validation",
            detail: "MCP server source must include /mcps/ segment",
            suggestions: [{ description: "Use @owner/mcps/server-name format." }],
          });
        case "missing-name":
          return yield* makeAppError({
            code: "not_found",
            detail: "MCP server source must include a server name",
            suggestions: [{ description: "Use @owner/mcps/server-name format." }],
          });
        default:
          return yield* makeAppError({
            code: "usage",
            detail: "MCP servers can only be installed from a registry",
            suggestions: [
              {
                description: "Use @owner/mcps/server-name or just server-name.",
              },
            ],
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
              code: "validation",
              detail: `Invalid source: ${error.message}`,
              suggestions: [
                {
                  description: "Use @owner/mcps/server-name or just server-name.",
                },
              ],
              cause: error,
            }),
          ),
        );

        if (source.type !== "registry") {
          return yield* makeAppError({
            code: "usage",
            detail: "MCP servers can only be installed from a registry",
            suggestions: [
              {
                description: "Use a registry source: @owner/mcps/server-name",
              },
            ],
          });
        }

        return [
          {
            source,
            owner: parsed.owner,
            serverName: parsed.serverName,
            versionRange: parsed.versionRange,
          },
        ];
      }),
    );

  const discoverRefs = (reqs: ReadonlyArray<McpServerInstallSourceRequest>) =>
    Effect.gen(function* () {
      const allRefs = yield* Effect.forEach(
        reqs,
        (req) =>
          sources
            .find(req.source, {
              names: [req.serverName],
              type: "mcp-server",
              owner: Option.some(req.owner),
              versionRange: req.versionRange,
            })
            .pipe(
              Effect.mapError((error) =>
                makeAppError({
                  code: "network",
                  detail: "MCP server could not be fetched from registry",
                  suggestions: [
                    {
                      description: "Verify the server name and registry configuration.",
                    },
                  ],
                  cause: error,
                }),
              ),
            ),
        { concurrency: "unbounded" },
      );
      return allRefs
        .flat()
        .filter((ref): ref is McpServerExtensionRef => ref.type === "mcp-server");
    });

  const finalizeIntent = (
    parsed: ParsedMcpServerInstallArgs,
    refs: ReadonlyArray<McpServerExtensionRef>,
  ): Effect.Effect<InstallMcpServerCommandIntent, AppError> =>
    Effect.gen(function* () {
      if (refs.length === 0) {
        const loginSuggestions = yield* registryLoginSuggestions;
        return yield* makeAppError({
          code: "not_found",
          detail: `MCP server "${parsed.serverName}" not found in registry`,
          suggestions: [
            {
              description: "Verify the server name and check available MCP servers.",
            },
            ...loginSuggestions,
          ],
        });
      }
      const [ref] = refs;
      if (ref === undefined) {
        const loginSuggestions = yield* registryLoginSuggestions;
        return yield* makeAppError({
          code: "not_found",
          detail: `MCP server "${parsed.serverName}" not found in registry`,
          suggestions: [
            {
              description: "Verify the server name and check available MCP servers.",
            },
            ...loginSuggestions,
          ],
        });
      }
      return {
        ref,
        versionRange: parsed.versionRange,
        force: parsed.force,
        env: parsed.env,
        ...(parsed.agents === undefined ? {} : { agents: parsed.agents }),
      };
    });

  const buildPlan = (intent: InstallMcpServerCommandIntent): Effect.Effect<Plan, AppError> =>
    Effect.gen(function* () {
      if (ws.scope === "user") {
        const configuredAgents = yield* ws.getConfiguredAgents().pipe(Effect.mapError(toAppError));
        const refused = configuredAgents.flatMap((agentId) => {
          if (!isConfigurableAgentId(agentId)) {
            return [`${agentId}: no MCP capability catalog entry`];
          }
          const capability = CONFIGURABLE_AGENTS_BY_ID[agentId].capabilities["mcp-server"];
          if (capability.axm.writer === null || !("transports" in capability.native)) {
            return [`${agentId}: no MCP config support`];
          }
          return capability.axm.writer.config.targets.some((target) => target.scope === ws.scope)
            ? []
            : [`${agentId}: no ${ws.scope} MCP config target`];
        });
        if (refused.length > 0) {
          return yield* makeAppError({
            code: "validation",
            detail: `Cannot install MCP servers in user scope for the configured agent placement: ${refused.join("; ")}`,
          });
        }
      }

      return {
        _tag: "Plan",
        name: "Install MCP server",
        description: Option.some(`Install MCP server ${intent.ref.server.name}`),
        jobs: [
          {
            concurrency: 1 as const,
            steps: [
              {
                key: `mcp-server:${intent.ref.server.name}`,
                label: intent.ref.server.name,
                readiness: "ready" as const,
                run: provide(
                  installMcpServer({
                    name: "install-mcp-server",
                    args: {
                      ref: intent.ref,
                      nonInteractive: yield* isNonInteractiveOptional,
                      force: intent.force,
                      versionRange: intent.versionRange,
                      skipSettings: Option.none(),
                      env: Option.some(intent.env ?? {}),
                      ...(intent.agents === undefined ? {} : { agents: intent.agents }),
                    },
                  }),
                ),
              },
            ],
          },
        ],
      } satisfies Plan;
    });

  return {
    parseArgs,
    resolveSourceRequests,
    discoverRefs,
    finalizeIntent,
    buildPlan,
  };
}).pipe(Effect.map((actions): InstallMcpServerActions => actions));
