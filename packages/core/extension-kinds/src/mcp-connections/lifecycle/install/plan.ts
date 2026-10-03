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
import { extensionRefLifecycleWarnings } from "@agentxm/workspace-kernel/resolution";
import {
  DesiredStateReader,
  SettingsReader,
  WorkspaceLocation,
  desiredStateProblemText,
  effectiveDesiredConstraint,
  type DesiredConstraintProposal,
  type DesiredStateGraph,
  mcpRegistryResolutionKey,
} from "@agentxm/workspace-kernel/workspace-state";

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import {
  extensionRefRegistryLifecycle,
  kernelFailureToStepFailure,
  sourceResolutionRefused,
  type InstallStepRequirements,
  type ResolveInstallRequirements,
} from "@agentxm/workspace-kernel/reconciliation";
import { installMcpServer } from "../../install/install-operation.js";
import { captureAgentOutputAuthority } from "@agentxm/workspace-kernel/projection";
import { materializeRegistryPackage } from "@agentxm/workspace-kernel/materialization";
import { fromFileLocation } from "@agentxm/host-primitives";
import { SETTINGS_FILENAME } from "@agentxm/extension-model/unstable/workspace-files";
import {
  configuredMcpCapability,
  declaredMcpWriterTargets,
  decodeMcpServerManifestAt,
  validateManifestMcpServerTargets,
  selectMcpDistribution,
  resolveMcpInvocation,
  manifestInputs,
  mcpInputVariables,
  mcpInputId,
  McpValueSchema,
  type McpBinding,
  type McpValue,
} from "@agentxm/workspace-kernel/agent-adapters";
import { MCP_SERVER_MANIFEST_FILENAME } from "@agentxm/extension-model/unstable/mcps/manifest-schema";
import {
  ExtensionNameSchema,
  type ExtensionName,
  type Handle,
} from "@agentxm/extension-model/unstable/extensions";
import type { McpServerExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
import type { Source } from "@agentxm/extension-model/unstable/sources/types";
import {
  SourceHostProviders,
  resolveSource,
  parseRegistryInstallTarget,
  registryLoginSuggestions,
} from "@agentxm/workspace-kernel/sources";
import {
  type RegistryBindingProposal,
  type SourceBindingProposal,
  operationPresentation,
  type Plan,
  ExtensionLifecycleFailed,
  installRefused,
} from "@agentxm/workspace-kernel/operations";

import { settleMcpSourceIdentityFor } from "../../source-identity.js";

/** One MCP connection, its local name, and the inputs the request supplied. */
export interface McpServerInstallIntent {
  readonly ref: McpServerExtensionRef;
  readonly localName: ExtensionName;
  readonly sourceIdentity: string;
  readonly versionRange: Option.Option<string>;
  readonly force: boolean;
  readonly nonInteractive: boolean;
  readonly authorizeSelection?: boolean;
  readonly bindingRequests?: ReadonlyArray<McpBindingRequest>;
  readonly distributionId?: string;
  readonly nativeOauth?: boolean;
}

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
  readonly bindingRequests?: ReadonlyArray<McpBindingRequest>;
  readonly distributionId?: string;
  readonly nativeOauth?: boolean;
}

/** One MCP source lookup, with the constraint every origin agrees on. */
export interface McpServerInstallSourceRequest {
  readonly source: Source;
  readonly owner: Option.Option<Handle>;
  readonly serverName: Option.Option<ExtensionName>;
  readonly versionRange: Option.Option<string>;
}

interface McpBindingRequest {
  readonly id: string;
  readonly value: McpValue;
}

/** Values remain literal unless the caller explicitly selects a native environment reference. */
const parseMcpBindingRequests = (args: {
  readonly bind: ReadonlyArray<string>;
  readonly bindEnv: ReadonlyArray<string>;
}): Effect.Effect<ReadonlyArray<McpBindingRequest>, ExtensionLifecycleFailed> =>
  Effect.gen(function* () {
    const requests: Array<McpBindingRequest> = [];
    for (const [items, symbolic] of [
      [args.bind, false],
      [args.bindEnv, true],
    ] as const) {
      for (const item of items) {
        const separator = item.indexOf("=");
        if (separator <= 0)
          return yield* installRefused({
            category: "usage",
            detail: "Bindings require INPUT_ID=VALUE",
          });
        const raw = item.slice(separator + 1);
        const value = yield* Schema.decodeUnknownEffect(McpValueSchema)(
          symbolic ? { env: raw } : raw,
        ).pipe(
          Effect.mapError(() =>
            installRefused({ category: "usage", detail: "Invalid symbolic environment binding" }),
          ),
        );
        requests.push({ id: item.slice(0, separator), value });
      }
    }
    return requests;
  });

const applyBindingRequests = (
  candidate: Parameters<typeof manifestInputs>[0],
  existing: ReadonlyArray<McpBinding>,
  requests: ReadonlyArray<McpBindingRequest>,
): Effect.Effect<ReadonlyArray<McpBinding>, ExtensionLifecycleFailed> =>
  Effect.gen(function* () {
    const descriptors = manifestInputs(candidate).flatMap((descriptor) => [
      descriptor,
      ...Object.entries(mcpInputVariables(descriptor.input) ?? {}).map(([variable, input]) => ({
        ...descriptor,
        target: { ...descriptor.target, variable },
        input,
      })),
    ]);
    const groups = new Map<string, Array<McpValue>>();
    for (const { id, value } of requests) groups.set(id, [...(groups.get(id) ?? []), value]);
    const additions: Array<McpBinding> = [];
    for (const [id, values] of groups) {
      const matches = descriptors.filter(({ target }) => mcpInputId(target) === id);
      const descriptor = matches[0];
      if (matches.length !== 1 || descriptor === undefined)
        return yield* installRefused({
          category: "usage",
          detail: "Binding ID must identify exactly one input in the selected distribution",
        });
      const first = values[0];
      if (first === undefined) continue;
      if (values.length > 1) {
        if (!descriptor.repeated)
          return yield* installRefused({
            category: "usage",
            detail: "Multiple bindings require a repeatable argument",
          });
        additions.push({ target: descriptor.target, values: [first, ...values.slice(1)] });
      } else additions.push({ target: descriptor.target, value: first });
    }
    return [...existing.filter(({ target }) => !groups.has(mcpInputId(target))), ...additions];
  });

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
  readonly bind: ReadonlyArray<string>;
  readonly bindEnv: ReadonlyArray<string>;
  readonly distributionId?: string;
  readonly nativeOauth?: boolean;
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
  const bindingRequests = yield* parseMcpBindingRequests(args);
  const preferences = {
    bindingRequests,
    ...(args.distributionId === undefined ? {} : { distributionId: args.distributionId }),
    ...(args.nativeOauth === undefined ? {} : { nativeOauth: args.nativeOauth }),
  };
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
          ...preferences,
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
      ...preferences,
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
    ...preferences,
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
    const sourceIdentity = yield* settleMcpSourceIdentityFor(
      graph,
      ref,
      localName,
      sourceRequest.source,
    ).pipe(
      Effect.mapError((cause) =>
        installRefused({
          category: "conflict",
          detail: kernelFailureToStepFailure(cause).detail,
          cause,
        }),
      ),
    );
    yield* selectMcpSourceConstraint(graph, {
      localName,
      sourceIdentity,
      versionRange: request.versionRange,
    });
    return {
      ref,
      localName,
      sourceIdentity,
      versionRange: request.versionRange,
      force: request.force,
      nonInteractive: request.nonInteractive,
      authorizeSelection: true,
      bindingRequests: request.bindingRequests ?? [],
      ...(request.distributionId === undefined ? {} : { distributionId: request.distributionId }),
      ...(request.nativeOauth === undefined ? {} : { nativeOauth: request.nativeOauth }),
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
      const capability = configuredMcpCapability(agentId);
      if (capability === undefined) {
        return [`${agentId}: no MCP config support`];
      }
      return declaredMcpWriterTargets(capability).some(
        ({ target }) => target.scope === location.scope,
      )
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

  const preferences = yield* Effect.scoped(
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
      const manifest = yield* decodeMcpServerManifestAt(
        path.join(manifestPath, MCP_SERVER_MANIFEST_FILENAME),
      ).pipe(
        Effect.mapError((cause) =>
          installRefused({
            category: "validation",
            detail: `Cannot read MCP manifest for ${intent.localName}: ${kernelFailureToStepFailure(cause).detail}`,
            cause,
          }),
        ),
      );
      const entries = yield* settings.entries("mcp-server");
      const entry = entries[intent.localName];
      const selection = selectMcpDistribution({
        manifest,
        selector: intent.distributionId === undefined ? entry?.distribution : undefined,
        id: intent.distributionId,
        allowUnambiguous: intent.authorizeSelection === true,
      });
      if (selection._tag === "blocked")
        return yield* installRefused({ category: "validation", detail: selection.reason });
      const bindings = yield* applyBindingRequests(
        selection.candidate,
        entry?.bindings ?? [],
        intent.bindingRequests ?? [],
      );
      const auth = intent.nativeOauth === true ? { type: "native-oauth" as const } : entry?.auth;
      const preferences = {
        distribution: selection.candidate.selector,
        bindings,
        ...(auth === undefined ? {} : { auth }),
      };
      const graph = yield* (yield* DesiredStateReader).graph();
      const closure = graph.mcpSourceClosures.find(
        (candidate) => candidate.key === intent.sourceIdentity,
      );
      for (const name of closure?.localNames ?? []) {
        if (name === intent.localName) continue;
        const preference =
          entries[name] ??
          graph.nodes.find((node) => node.type === "mcp-server" && node.name === name)?.preference;
        const resolution = resolveMcpInvocation({
          manifest,
          distribution: preference?.distribution,
          bindings: preference?.bindings,
          auth: preference?.auth,
        });
        if (resolution._tag === "blocked")
          return yield* installRefused({
            category: "validation",
            detail: `Shared MCP alias ${name} blocks the source update: ${resolution.reason}`,
          });
      }
      const authority = yield* captureAgentOutputAuthority();
      yield* validateManifestMcpServerTargets({
        nativeDirectoryInputs: location.nativeDirectoryInputs,
        nativeInsertionEligible: false,
        workspaceRoot: location.baseDir,
        manifest,
        agentIds: yield* settings.configuredAgents,
        scope: location.scope,
        serverName: intent.localName,
        ...preferences,
        enabled: entries[intent.localName]?.enabled ?? true,
        previousManagedEntries: authority.expectedMcpEntries[intent.localName] ?? [],
      }).pipe(
        Effect.mapError((cause) =>
          installRefused({
            category: "conflict",
            detail: kernelFailureToStepFailure(cause).detail,
            recover:
              "Use an MCP package whose transport and symbolic inputs are supported by every configured reader of the shared target.",
            cause,
          }),
        ),
      );
      return preferences;
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
                sourceIdentity: intent.sourceIdentity,
                nonInteractive: intent.nonInteractive,
                force: intent.force,
                declaration: { name: intent.localName, versionRange: intent.versionRange },
                ...preferences,
              },
            }).pipe(Effect.mapError(kernelFailureToStepFailure)),
          },
        ],
      },
    ],
  } satisfies Plan<InstallStepRequirements>;
});
