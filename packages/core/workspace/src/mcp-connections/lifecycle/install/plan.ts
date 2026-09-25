/**
 * Installing an MCP connection from a resolved source.
 *
 * An MCP server is acquired once and referenced by a local connection name, so
 * this decides who owns that name, which version constraint every origin
 * referencing the same server agrees on, and whether the selected workspace
 * scope can hold an MCP configuration at all.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import { extensionRefLifecycleWarnings } from "../../../lifecycle/warnings.js";
import {
  DesiredStateReader,
  SettingsReader,
  WorkspaceLocation,
  desiredStateProblemText,
  effectiveDesiredConstraint,
  isSourcedDesiredExtension,
  type DesiredConstraintProposal,
  type DesiredStateGraph,
} from "../../../desired-state/index.js";

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import {
  extensionRefRegistryLifecycle,
  installMcpServer,
  readMcpServerManifest,
} from "../../../reconciliation/index.js";
import { materializeRegistryPackage } from "../../../materialization/index.js";
import { fromFileLocation } from "@agentxm/host-primitives";
import { makeWorkspaceRelativeSourcePath } from "@agentxm/extension-model/unstable/path-types";
import { SETTINGS_FILENAME } from "@agentxm/extension-model/unstable/workspace-files";
import { validateManifestMcpServerTargets } from "../../../projection/agent-adapters/index.js";
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
import type { Source } from "@agentxm/extension-model/unstable/sources/types";
import { printSourceParams } from "@agentxm/extension-model/unstable/sources/printer";
import { SourceHostProviders, resolveSource } from "../../../resolution/sources/index.js";
import type { RegistryBindingProposal, SourceBindingProposal } from "../../../resolution/index.js";
import { operationPresentation, type Plan } from "../../../transitions/planning/index.js";
import { desiredMcpSourceKey, mcpRegistryResolutionKey } from "../../../desired-state/index.js";

import { ExtensionLifecycleFailed } from "../../../lifecycle/errors.js";
import { admitMcpLocalName } from "../domain/source-admission.js";
import { lifecycleStepFailure } from "../../../lifecycle/step-failure.js";
import { registryLoginSuggestions } from "../../../lifecycle/install/registry-login-suggestion.js";
import { parseRegistryInstallTarget } from "../../../lifecycle/install/registry-install-target.js";
import {
  installRefused,
  sourceResolutionRefused,
  type InstallStepRequirements,
  type McpServerInstallIntent,
  type ResolveInstallRequirements,
} from "../../../lifecycle/install/vocabulary.js";

const LOCAL_NAME_RULE =
  "Local MCP names must be max 64 chars, use lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen.";

const SOURCE_GUIDANCE = "Use @owner/mcps/server-name, a Git locator, or a local package path.";

/** An MCP install request after grammar parsing, before anything is discovered. */
export interface ParsedMcpServerInstallRequest {
  readonly owner: Option.Option<Handle>;
  readonly serverName: Option.Option<ExtensionName>;
  readonly localName: Option.Option<ExtensionName>;
  readonly versionRange: Option.Option<string>;
  readonly resolvedInput: string;
  readonly force: boolean;
  readonly nonInteractive: boolean;
  readonly env: Readonly<Record<string, string>>;
}

/** One MCP source lookup, with the constraint every origin agrees on. */
export interface McpServerInstallSourceRequest {
  readonly source: Source;
  readonly owner: Option.Option<Handle>;
  readonly serverName: Option.Option<ExtensionName>;
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
  const settings = yield* SettingsReader;
  const trimmed = args.source.trim();
  const env = yield* parseMcpEnvInputs(args.env);
  const explicitLocalName = yield* Option.match(args.localName, {
    onNone: () => Effect.succeed(Option.none<ExtensionName>()),
    onSome: (name) => decodeLocalName(name).pipe(Effect.map(Option.some)),
  });
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
        return {
          owner: Option.none<Handle>(),
          serverName: Option.none<ExtensionName>(),
          localName: explicitLocalName,
          versionRange: Option.none<string>(),
          resolvedInput: trimmed,
          force: args.force,
          nonInteractive: args.nonInteractive,
          env,
        };
    }
  }

  if (parsed.success.kind === "registry") {
    return {
      owner: Option.some(parsed.success.owner),
      serverName: Option.some(parsed.success.name),
      localName: Option.orElse(explicitLocalName, () => Option.some(parsed.success.name)),
      versionRange: Option.fromUndefinedOr(parsed.success.versionRange),
      resolvedInput: trimmed,
      force: args.force,
      nonInteractive: args.nonInteractive,
      env,
    };
  }

  const owner = yield* settings.owner.pipe(
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
    owner: Option.some(owner),
    serverName: Option.some(parsed.success.name),
    localName: Option.orElse(explicitLocalName, () => Option.some(parsed.success.name)),
    versionRange: Option.none<string>(),
    resolvedInput: `${owner}/mcps/${parsed.success.name}`,
    force: args.force,
    nonInteractive: args.nonInteractive,
    env,
  };
});

/**
 * Admit one local connection to a source and select the range it resolves
 * within: the desired graph's effective constraint once the requested range
 * rewrites this connection's direct declaration. Every other connection to
 * the source and every Pack that requires it still contributes its range,
 * and a conflict among them refuses the install naming every contributor.
 */
const selectMcpSourceConstraint = (
  graph: DesiredStateGraph,
  input: {
    readonly localName: ExtensionName;
    readonly sourceIdentity: string;
    readonly versionRange: Option.Option<string>;
  },
): Effect.Effect<Option.Option<string>, ExtensionLifecycleFailed> =>
  Effect.gen(function* () {
    const localConnection = graph.nodes.find(
      (node) => node.type === "mcp-server" && node.name === input.localName,
    );
    yield* admitMcpLocalName({
      localName: input.localName,
      sourceIdentity: input.sourceIdentity,
      localConnection:
        localConnection === undefined
          ? undefined
          : {
              sourceIdentity: isSourcedDesiredExtension(localConnection)
                ? desiredMcpSourceKey(localConnection.identity)
                : null,
            },
    }).pipe(
      Effect.mapError((cause) =>
        installRefused({ category: "conflict", detail: cause.reason, cause }),
      ),
    );
    const declaration: DesiredConstraintProposal = Option.isSome(input.versionRange)
      ? {
          source: "settings",
          localName: input.localName,
          range: input.versionRange.value,
          location: SETTINGS_FILENAME,
        }
      : { source: "settings", localName: input.localName };
    const effective = effectiveDesiredConstraint(
      graph,
      { type: "mcp-server", name: input.localName, sourceKey: input.sourceIdentity },
      [declaration],
    );
    if (Result.isFailure(effective)) {
      return yield* installRefused({
        category: "conflict",
        detail: `Cannot connect ${input.localName} because its source constraints are unsatisfiable: ${desiredStateProblemText(effective.failure)}`,
        recover:
          "Request a range every other connection to the source and every Pack that requires it admits",
      });
    }
    return effective.success.range;
  });

/** Resolve the source named by the parsed request. */
export const resolveMcpServerSourceRequest: (
  request: ParsedMcpServerInstallRequest,
) => Effect.Effect<
  McpServerInstallSourceRequest,
  ExtensionLifecycleFailed,
  ResolveInstallRequirements
> = Effect.fn("InstallExtensions.resolveMcpSource")(function* (
  request: ParsedMcpServerInstallRequest,
) {
  const source = yield* resolveSource(request.resolvedInput, { expectedType: "mcp-server" }).pipe(
    Effect.mapError((cause) =>
      installRefused({
        category: "validation",
        detail: `Invalid source: ${cause.message}`,
        suggestions: [{ description: SOURCE_GUIDANCE }],
        cause,
      }),
    ),
  );

  if (source.type === "registry") {
    const owner = yield* Option.match(request.owner, {
      onNone: () =>
        installRefused({
          category: "internal",
          detail: "Registry MCP source has no owner after parsing",
        }),
      onSome: Effect.succeed,
    });
    const serverName = yield* Option.match(request.serverName, {
      onNone: () =>
        installRefused({
          category: "internal",
          detail: "Registry MCP source has no server name after parsing",
        }),
      onSome: Effect.succeed,
    });
    const localName = yield* Option.match(request.localName, {
      onNone: () =>
        installRefused({
          category: "internal",
          detail: "Registry MCP source has no local name after parsing",
        }),
      onSome: Effect.succeed,
    });
    const identity = mcpRegistryResolutionKey({
      authority: source.location,
      owner,
      name: serverName,
    });
    const graph = yield* DesiredStateReader.pipe(
      Effect.flatMap((desiredState) => desiredState.graph()),
      Effect.mapError((cause) =>
        installRefused({
          category: "internal",
          detail: "Desired MCP state could not be read",
          cause,
        }),
      ),
    );
    const versionRange = yield* selectMcpSourceConstraint(graph, {
      localName,
      sourceIdentity: identity,
      versionRange: request.versionRange,
    });
    return {
      source,
      owner: request.owner,
      serverName: request.serverName,
      versionRange,
    };
  }

  return {
    source,
    owner: request.owner,
    serverName: request.serverName,
    versionRange: request.versionRange,
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
      names: Option.toArray(request.serverName),
      type: "mcp-server",
      owner: request.owner,
      versionRange: request.versionRange,
    })
    .pipe(
      Effect.mapError((cause) =>
        sourceResolutionRefused(cause, [{ description: SOURCE_GUIDANCE }]),
      ),
    );
  return refs.filter((ref): ref is McpServerExtensionRef => ref.type === "mcp-server");
});

/** Settle the connection this request installs, or refuse when nothing matched. */
export const finalizeMcpServerInstallIntent: (
  request: ParsedMcpServerInstallRequest,
  sourceRequest: McpServerInstallSourceRequest,
  refs: ReadonlyArray<McpServerExtensionRef>,
) => Effect.Effect<McpServerInstallIntent, ExtensionLifecycleFailed, ResolveInstallRequirements> =
  Effect.fn("InstallExtensions.finalizeMcpIntent")(function* (
    request: ParsedMcpServerInstallRequest,
    sourceRequest: McpServerInstallSourceRequest,
    refs: ReadonlyArray<McpServerExtensionRef>,
  ) {
    const [ref] = refs;
    if (ref === undefined) {
      const loginSuggestions =
        sourceRequest.source.type === "registry"
          ? yield* SettingsReader.pipe(
              Effect.flatMap((settings) => settings.registrySourceHosts),
              Effect.mapError((cause) =>
                installRefused({
                  category: "internal",
                  detail: "Configured registry hosts could not be read",
                  cause,
                }),
              ),
              Effect.flatMap((hosts) =>
                registryLoginSuggestions(hosts.map((host) => host.location.href)),
              ),
            )
          : [];
      return yield* installRefused({
        category: "not_found",
        detail: "No MCP server was found in the source",
        suggestions: [
          { description: "Verify the source and check its MCP server manifest." },
          ...loginSuggestions,
        ],
      });
    }
    if (refs.length > 1) {
      return yield* installRefused({
        category: "usage",
        detail: `MCP source contains multiple servers: ${refs.map((candidate) => candidate.server.name).join(", ")}`,
        suggestions: [{ description: "Use a source locator that selects one MCP server package." }],
      });
    }
    const localName = Option.getOrElse(request.localName, () => ref.server.name);
    const requestedIdentity = yield* Effect.gen(function* () {
      if (sourceRequest.source.type === "registry") {
        return mcpRegistryResolutionKey({
          authority: sourceRequest.source.location,
          owner: ref.owner,
          name: ref.server.name,
        });
      }
      if (sourceRequest.source.type !== "local") return printSourceParams(sourceRequest.source);
      if (ref.refType !== "local") {
        return yield* installRefused({
          category: "internal",
          detail: "Local MCP source resolved to a non-local package reference",
        });
      }
      const location = yield* WorkspaceLocation;
      const path = yield* Path.Path;
      const localPath = sourceRequest.source.path;
      return Option.getOrElse(
        makeWorkspaceRelativeSourcePath(path, location.baseDir, fromFileLocation(ref.location)),
        () => localPath,
      );
    });
    const desiredState = yield* DesiredStateReader;
    const graph = yield* desiredState.graph().pipe(
      Effect.mapError((cause) =>
        installRefused({
          category: "internal",
          detail: "Desired MCP state could not be read",
          cause,
        }),
      ),
    );
    const existingLocalNode = graph.nodes.find(
      (node) => node.type === "mcp-server" && node.name === localName,
    );
    // A local source is one source however it is spelled: the connection
    // keeps the key the existing declaration already carries.
    const existingLocalIdentity =
      existingLocalNode?.identity.authority === "path" ? existingLocalNode.identity : undefined;
    const identity = yield* sourceRequest.source.type === "local" &&
    ref.refType === "local" &&
    existingLocalIdentity !== undefined
      ? Effect.gen(function* () {
          const location = yield* WorkspaceLocation;
          const path = yield* Path.Path;
          return path.resolve(location.baseDir, existingLocalIdentity.locator) ===
            path.resolve(fromFileLocation(ref.location))
            ? desiredMcpSourceKey(existingLocalIdentity)
            : requestedIdentity;
        })
      : Effect.succeed(requestedIdentity);
    yield* selectMcpSourceConstraint(graph, {
      localName,
      sourceIdentity: identity,
      versionRange: request.versionRange,
    });
    return {
      ref,
      localName,
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
  const location = yield* WorkspaceLocation;
  const settings = yield* SettingsReader;
  // A user-scope workspace can only hold an MCP configuration when every
  // configured agent has a user-scope MCP config target to write into.
  if (location.scope === "user") {
    const configuredAgents = yield* settings.configuredAgents.pipe(
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
      return capability.axm.writer.config.targets.some((target) => target.scope === location.scope)
        ? []
        : [`${agentId}: no ${location.scope} MCP config target`];
    });
    if (refused.length > 0) {
      return yield* installRefused({
        category: "validation",
        detail: `Cannot install MCP servers for this user with the configured agent locations: ${refused.join("; ")}`,
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
                publisherBindingId: ref.publisherBindingId,
                lifecycleWarnings: extensionRefLifecycleWarnings(ref),
                messages: {
                  integrityMismatchDetail: `Integrity mismatch for ${ref.name}@${ref.version}`,
                },
              });
            })
          : fromFileLocation(ref.location);
      const manifest = yield* readMcpServerManifest(manifestPath);
      if (Option.isNone(manifest)) {
        return yield* installRefused({
          category: "validation",
          detail: `Cannot read MCP manifest for ${intent.localName}`,
        });
      }
      const entries = yield* settings.entries("mcp-server");
      yield* validateManifestMcpServerTargets({
        manifest: manifest.value,
        agentIds: yield* settings.configuredAgents,
        scope: location.scope,
        serverName: intent.localName,
        values: { ...entries[intent.localName]?.env, ...intent.env },
        enabled: entries[intent.localName]?.enabled ?? true,
      }).pipe(
        Effect.mapError((cause) =>
          installRefused({
            category: "conflict",
            detail: cause._tag === "McpSharedTargetConflict" ? cause.reason : cause.detail,
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

  const sourceBinding = {
    extensionType: "mcp-server",
    target: intent.localName,
    ref: intent.ref,
  } satisfies SourceBindingProposal;
  const registryBinding: RegistryBindingProposal | undefined =
    intent.ref.refType === "registry"
      ? {
          extensionType: "mcp-server",
          target: intent.localName,
          owner: intent.ref.owner,
          packageName: intent.ref.name,
          version: intent.ref.version,
          publisherBindingId: intent.ref.publisherBindingId,
        }
      : undefined;
  const lifecycleWarnings = extensionRefLifecycleWarnings(intent.ref);
  const registryLifecycle = extensionRefRegistryLifecycle(intent.ref);

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
            ...(lifecycleWarnings.length === 0
              ? { readiness: "ready" as const }
              : { readiness: "warn" as const, warnMessage: lifecycleWarnings.join("; ") }),
            sourceBinding,
            ...(registryBinding === undefined ? {} : { registryBinding }),
            ...(registryLifecycle === undefined ? {} : { registryLifecycle }),
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
