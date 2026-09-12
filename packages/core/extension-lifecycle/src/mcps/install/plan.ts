/**
 * Installing an MCP connection from the registry.
 *
 * An MCP server is acquired once and referenced by a local connection name, so
 * this decides who owns that name, which version constraint every origin
 * referencing the same server agrees on, and whether the selected workspace
 * scope can hold an MCP configuration at all.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import { installMcpServer, readMcpServerManifest } from "@agentxm/workspace-reconciliation";
import { materializeRegistryPackage } from "@agentxm/extension-materialization";
import { validateManifestMcpServerTargets } from "@agentxm/agent-integration";
import {
  CONFIGURABLE_AGENTS_BY_ID,
  type ConfigurableAgentId,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import {
  ExtensionNameSchema,
  type ExtensionName,
  type Handle,
} from "@agentxm/extension-model/unstable/extensions";
import type { McpServerExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
import type { RegistrySource } from "@agentxm/extension-model/unstable/sources/types";
import { intersectVersionConstraints } from "@agentxm/extension-model/unstable/version-constraints";
import { SourceHostProviders, resolveSource } from "@agentxm/extension-sources";
import { operationPresentation, type Plan } from "@agentxm/workspace-operations";
import { WorkspaceMutations, mcpRegistryResolutionKey } from "@agentxm/workspace-state";

import { ExtensionLifecycleFailed } from "../../errors.js";
import { lifecycleStepFailure } from "../../step-failure.js";
import { registryLoginSuggestions } from "../../install/registry-login-suggestion.js";
import { parseRegistryInstallTarget } from "../../install/registry-install-target.js";
import {
  installRefused,
  type InstallStepRequirements,
  type McpServerInstallIntent,
  type ResolveInstallRequirements,
} from "../../install/vocabulary.js";

const LOCAL_NAME_RULE =
  "Local MCP names must be max 64 chars, use lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen.";

const REGISTRY_ONLY = "Use @owner/mcps/server-name or just server-name.";

/** An MCP install request after grammar parsing, before anything is discovered. */
export interface ParsedMcpServerInstallRequest {
  readonly owner: Handle;
  readonly serverName: ExtensionName;
  readonly localName: ExtensionName;
  readonly versionRange: Option.Option<string>;
  readonly resolvedInput: string;
  readonly force: boolean;
  readonly nonInteractive: boolean;
  readonly env: Readonly<Record<string, string>>;
}

/** One MCP registry lookup, with the constraint every origin agrees on. */
export interface McpServerInstallSourceRequest {
  readonly source: RegistrySource;
  readonly owner: Handle;
  readonly serverName: ExtensionName;
  readonly versionRange: Option.Option<string>;
}

/**
 * Decode repeated `--env KEY=VALUE` inputs into a record. Later occurrences of
 * the same key win. Registry installs resolve declared inputs by name, so a
 * bare `KEY` (passthrough from the ambient environment, as `axm mcps add`
 * allows) is refused here rather than silently resolving to nothing.
 */
export const parseMcpEnvInputs = (
  env: ReadonlyArray<string>,
): Effect.Effect<Readonly<Record<string, string>>, ExtensionLifecycleFailed> =>
  Effect.gen(function* () {
    const parsed: Record<string, string> = {};
    for (const value of env) {
      const separator = value.indexOf("=");
      if (separator <= 0) {
        return yield* installRefused({
          category: "usage",
          detail: "--env must use KEY=VALUE format",
        });
      }
      parsed[value.slice(0, separator)] = value.slice(separator + 1);
    }
    return parsed;
  });

const isConfigurableAgentId = (agentId: string): agentId is ConfigurableAgentId =>
  agentId in CONFIGURABLE_AGENTS_BY_ID;

const decodeLocalName = (value: string): Effect.Effect<ExtensionName, ExtensionLifecycleFailed> =>
  Schema.decodeUnknownEffect(ExtensionNameSchema)(value).pipe(
    Effect.mapError((cause) =>
      installRefused({ category: "validation", detail: LOCAL_NAME_RULE, cause }),
    ),
  );

/** What an MCP install command supplies before anything is parsed. */
export interface McpServerInstallArgs {
  readonly source: string;
  readonly localName: Option.Option<string>;
  readonly env: ReadonlyArray<string>;
  readonly force: boolean;
  readonly nonInteractive: boolean;
}

/** Read the MCP source grammar and settle the local connection name. */
export const parseMcpServerInstallRequest: (
  args: McpServerInstallArgs,
) => Effect.Effect<
  ParsedMcpServerInstallRequest,
  ExtensionLifecycleFailed,
  ResolveInstallRequirements
> = Effect.fn("InstallExtensions.parseMcpRequest")(function* (args: McpServerInstallArgs) {
  const ws = yield* WorkspaceMutations;
  const trimmed = args.source.trim();
  const env = yield* parseMcpEnvInputs(args.env);
  const parsed = parseRegistryInstallTarget(trimmed, {
    expectedType: "mcp-server",
    allowBareName: true,
  });

  if (Result.isFailure(parsed)) {
    switch (parsed.failure.kind) {
      case "wrong-type":
        return yield* installRefused({
          category: "validation",
          detail: "MCP server source must include /mcps/ segment",
          suggestions: [{ description: "Use @owner/mcps/server-name format." }],
        });
      case "missing-name":
        return yield* installRefused({
          category: "not_found",
          detail: "MCP server source must include a server name",
          suggestions: [{ description: "Use @owner/mcps/server-name format." }],
        });
      default:
        return yield* installRefused({
          category: "usage",
          detail: "MCP servers can only be installed from a registry",
          suggestions: [{ description: REGISTRY_ONLY }],
        });
    }
  }

  const requestedLocalName = Option.getOrElse(args.localName, () => parsed.success.name);

  if (parsed.success.kind === "registry") {
    return {
      owner: parsed.success.owner,
      serverName: parsed.success.name,
      localName: yield* decodeLocalName(requestedLocalName),
      versionRange: Option.fromUndefinedOr(parsed.success.versionRange),
      resolvedInput: trimmed,
      force: args.force,
      nonInteractive: args.nonInteractive,
      env,
    };
  }

  const owner = yield* ws.getConfiguredOwner().pipe(
    Effect.mapError((cause) =>
      installRefused({
        category: "internal",
        detail: "Configured workspace owner could not be read",
        cause,
      }),
    ),
    Effect.flatMap(
      Option.match({
        onNone: () =>
          Effect.fail(
            installRefused({
              category: "validation",
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
    localName: yield* decodeLocalName(requestedLocalName),
    versionRange: Option.none<string>(),
    resolvedInput: `${owner}/mcps/${parsed.success.name}`,
    force: args.force,
    nonInteractive: args.nonInteractive,
    env,
  };
});

/**
 * Decide which local name may own the connection and which version constraint
 * every origin referencing the same registry server can agree on.
 */
export const resolveMcpServerSourceRequest: (
  request: ParsedMcpServerInstallRequest,
) => Effect.Effect<
  McpServerInstallSourceRequest,
  ExtensionLifecycleFailed,
  ResolveInstallRequirements
> = Effect.fn("InstallExtensions.resolveMcpSource")(function* (
  request: ParsedMcpServerInstallRequest,
) {
  const ws = yield* WorkspaceMutations;
  const source = yield* resolveSource(request.resolvedInput).pipe(
    Effect.mapError((cause) =>
      installRefused({
        category: "validation",
        detail: `Invalid source: ${cause.message}`,
        suggestions: [{ description: REGISTRY_ONLY }],
        cause,
      }),
    ),
  );

  if (source.type !== "registry") {
    return yield* installRefused({
      category: "usage",
      detail: "MCP servers can only be installed from a registry",
      suggestions: [{ description: "Use a registry source: @owner/mcps/server-name" }],
    });
  }

  const identity = mcpRegistryResolutionKey({
    authority: source.location,
    owner: request.owner,
    name: request.serverName,
  });
  const graph = yield* ws.getDesiredStateGraph().pipe(
    Effect.mapError((cause) =>
      installRefused({
        category: "internal",
        detail: "Desired MCP state could not be read",
        cause,
      }),
    ),
  );
  const existingLocalNode = graph.nodes.find(
    (node) => node.type === "mcp-server" && node.name === request.localName,
  );
  if (
    existingLocalNode !== undefined &&
    (existingLocalNode.authority === "inline" || existingLocalNode.identity !== identity)
  ) {
    return yield* installRefused({
      category: "conflict",
      detail: `Local MCP name "${request.localName}" is already owned by a different source`,
    });
  }

  const closure = graph.mcpSourceClosures.find((candidate) => candidate.identity === identity);
  const retainedConstraints = (closure?.origins ?? []).flatMap((origin) => {
    if (origin.constraint === undefined) return [];
    if (origin.type === "settings" && origin.localName === request.localName) return [];
    return [origin.constraint];
  });
  const requestedConstraints = Option.match(request.versionRange, {
    onNone: () => retainedConstraints,
    onSome: (range) => [...retainedConstraints, range],
  });
  const combinedConstraint = intersectVersionConstraints(requestedConstraints);
  if (requestedConstraints.length > 0 && combinedConstraint === undefined) {
    const contributors = (closure?.origins ?? [])
      .filter((origin) => origin.constraint !== undefined)
      .map((origin) =>
        origin.type === "settings"
          ? `${origin.localName ?? "settings"}:${origin.constraint}`
          : `${origin.pack}:${origin.constraint}`,
      );
    return yield* installRefused({
      category: "conflict",
      detail: `MCP source constraints do not intersect for ${request.owner}/mcps/${request.serverName}: ${[
        ...contributors,
        `${request.localName}:${Option.getOrElse(request.versionRange, () => "*")}`,
      ].join(", ")}`,
    });
  }

  return {
    source,
    owner: request.owner,
    serverName: request.serverName,
    versionRange:
      combinedConstraint === undefined ? Option.none<string>() : Option.some(combinedConstraint),
  };
});

/** Discover the MCP server the resolved request names. */
export const discoverMcpServerRefs: (
  request: McpServerInstallSourceRequest,
) => Effect.Effect<
  ReadonlyArray<McpServerExtensionRef>,
  ExtensionLifecycleFailed,
  ResolveInstallRequirements
> = Effect.fn("InstallExtensions.discoverMcpServers")(function* (
  request: McpServerInstallSourceRequest,
) {
  const sources = yield* SourceHostProviders;
  const refs = yield* sources
    .find(request.source, {
      names: [request.serverName],
      type: "mcp-server",
      owner: Option.some(request.owner),
      versionRange: request.versionRange,
    })
    .pipe(
      Effect.mapError((cause) =>
        installRefused({
          category: "network",
          detail: "MCP server could not be fetched from registry",
          suggestions: [{ description: "Verify the server name and registry configuration." }],
          cause,
        }),
      ),
    );
  return refs.filter((ref): ref is McpServerExtensionRef => ref.type === "mcp-server");
});

/** Settle the connection this request installs, or refuse when nothing matched. */
export const finalizeMcpServerInstallIntent: (
  request: ParsedMcpServerInstallRequest,
  refs: ReadonlyArray<McpServerExtensionRef>,
) => Effect.Effect<McpServerInstallIntent, ExtensionLifecycleFailed, ResolveInstallRequirements> =
  Effect.fn("InstallExtensions.finalizeMcpIntent")(function* (
    request: ParsedMcpServerInstallRequest,
    refs: ReadonlyArray<McpServerExtensionRef>,
  ) {
    const ws = yield* WorkspaceMutations;
    const [ref] = refs;
    if (ref === undefined) {
      const hosts = yield* ws.getRegistrySourceHosts().pipe(
        Effect.mapError((cause) =>
          installRefused({
            category: "internal",
            detail: "Configured registry hosts could not be read",
            cause,
          }),
        ),
      );
      const loginSuggestions = yield* registryLoginSuggestions(
        hosts.map((host) => host.location.href),
      );
      return yield* installRefused({
        category: "not_found",
        detail: `MCP server "${request.serverName}" not found in registry`,
        suggestions: [
          { description: "Verify the server name and check available MCP servers." },
          ...loginSuggestions,
        ],
      });
    }
    return {
      ref,
      localName: request.localName,
      versionRange: request.versionRange,
      force: request.force,
      nonInteractive: request.nonInteractive,
      env: request.env,
    } satisfies McpServerInstallIntent;
  });

/** The closure a settled MCP intent becomes. */
export const planMcpServerInstall: (
  intent: McpServerInstallIntent,
) => Effect.Effect<
  Plan<InstallStepRequirements>,
  ExtensionLifecycleFailed,
  InstallStepRequirements
> = Effect.fn("InstallExtensions.planMcpServer")(function* (intent: McpServerInstallIntent) {
  const ws = yield* WorkspaceMutations;
  // A user-scope workspace can only hold an MCP configuration when every
  // configured agent has a user-scope MCP config target to write into.
  if (ws.scope === "user") {
    const configuredAgents = yield* ws.getConfiguredAgents().pipe(
      Effect.mapError((cause) =>
        installRefused({
          category: "internal",
          detail: "Configured agents could not be read",
          cause,
        }),
      ),
    );
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
      return yield* installRefused({
        category: "validation",
        detail: `Cannot install MCP servers in user scope for the configured agent placement: ${refused.join("; ")}`,
      });
    }
  }

  yield* Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const ref = intent.ref;
      // Inspect verified package bytes outside the workspace. A fresh install
      // has no canonical manifest for the usual projection inspection to read.
      const manifestPath =
        ref.refType === "registry"
          ? yield* Effect.gen(function* () {
              const scratch = yield* fs.makeTempDirectoryScoped({ prefix: "axm-mcp-preflight-" });
              return yield* materializeRegistryPackage({
                baseDir: scratch,
                destinationPath: path.join(scratch, "package"),
                sourceLocation: ref.source.location,
                owner: ref.owner,
                type: "mcp-server",
                name: ref.name,
                version: ref.version,
                integrity: ref.integrity,
                messages: {
                  integrityMismatchDetail: `Integrity mismatch for ${ref.name}@${ref.version}`,
                },
              });
            })
          : ref.location;
      const manifest = yield* readMcpServerManifest(manifestPath);
      if (Option.isNone(manifest)) {
        return yield* installRefused({
          category: "validation",
          detail: `Cannot read MCP manifest for ${intent.localName}`,
        });
      }
      const entries = yield* ws.getConfiguredMcpServerEntries();
      yield* validateManifestMcpServerTargets({
        manifest: manifest.value,
        agentIds: yield* ws.getConfiguredAgents(),
        scope: ws.scope,
        serverName: intent.localName,
        values: { ...entries[intent.localName]?.env, ...intent.env },
        enabled: entries[intent.localName]?.enabled ?? true,
      }).pipe(
        Effect.mapError((cause) =>
          installRefused({
            category: "conflict",
            detail: cause.reason,
            recover:
              "Use an MCP package whose transport and symbolic inputs are supported by every configured reader of the shared target.",
            cause,
          }),
        ),
      );
    }),
  ).pipe(
    Effect.mapError((cause) =>
      cause instanceof ExtensionLifecycleFailed
        ? cause
        : installRefused({
            category: "validation",
            detail: `Cannot inspect MCP package ${intent.localName}`,
            cause,
          }),
    ),
  );

  return {
    _tag: "Plan",
    name: "Install MCP server",
    description: Option.some(`Install MCP server ${intent.localName}`),
    presentation: operationPresentation(
      { imperative: "install", past: "Installed", gerund: "Installing" },
      "mcp-server",
    ),
    jobs: [
      {
        concurrency: 1,
        steps: [
          {
            key: `mcp-server:${intent.localName}`,
            label: intent.localName,
            readiness: "ready",
            run: installMcpServer({
              name: "install-mcp-server",
              args: {
                ref: intent.ref,
                localName: intent.localName,
                nonInteractive: intent.nonInteractive,
                force: intent.force,
                declaration: { name: intent.localName, versionRange: intent.versionRange },
                env: Option.some(intent.env ?? {}),
              },
            }).pipe(Effect.mapError(lifecycleStepFailure)),
          },
        ],
      },
    ],
  } satisfies Plan<InstallStepRequirements>;
});
