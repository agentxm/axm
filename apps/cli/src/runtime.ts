import { ArtifactHttpClient } from "@agentxm/workspace-kernel/sources";
import { resolveNativeReferent } from "@agentxm/workspace-kernel/locations";
import {
  WorkspaceTransactionScopesLive,
  WorkspaceFileWriteLocksLive,
} from "@agentxm/workspace-kernel/settlement/live";
import { UpdateCheckCacheLive } from "./cli-runtime/update-cache.js";
import { CliUpgradeObservationLive } from "./cli-runtime/upgrade-observation.js";
import { recordingConfigurationFailure } from "./cli-runtime/configuration-failure.js";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { CliConfig, CliOutput, Flag, GlobalFlag } from "effect/cli";

import { AppError, makeAppError } from "./app-error/index.js";

import { AgentPresenceProbeLive } from "@agentxm/workspace-kernel/agent-adapters/live";
import {
  AxmSkillCandidateGateLive,
  RegistryResolutionPolicyLive,
} from "@agentxm/workspace-kernel/resolution/live";
import {
  BundledAxmSkillAssetLive,
  InstallSelectionLive,
  type ExpectedCliError,
  getCommandSemanticProperties,
  InterruptionSignalSourceLive,
  makeFoundationLayer,
  ResolvePlanInteractionLive,
  resolveCliFormat,
  setCommandSemanticProperties,
  withCliErrorHandling,
} from "./cli-runtime/index.js";
import {
  Verbosity,
  type VerbosityLevel,
  isEnabledEnvRequest,
  nonInteractiveFlag,
  jsonFlag,
  verboseFlag,
  debugFlag,
  quietFlag,
  directoryFlag,
} from "./cli-flags/index.js";

import { ExtensionKindsLive } from "@agentxm/extension-kinds/live";
import {
  ConfiguredAgentOutcomesProviderLive,
  ProjectionParticipantsLive,
} from "@agentxm/workspace-kernel/reconciliation/live";
import { KnowledgeIndexLive } from "@agentxm/workspace-features/knowledge-query/live";
import {
  WorkspaceInvariantFactsLive,
  CodingAgentRepositoryLive,
  NativeWriteAuthorityLive,
} from "@agentxm/workspace-kernel/projection/live";
import { AuthLoginPresenterLive } from "./auth-login-presenter.js";
import { failureToAppError } from "./app-error/conversions.js";
import { WorkspaceFailureConversionLive } from "./app-error/failure-catalog.js";
import {
  InvocationCredentialSource,
  appErrorForCredentialSource,
} from "./app-error/trusted-publisher-recoveries.js";
import { WorkspaceInitializationInteractionLive } from "./workspace-initialization-interaction-live.js";
import {
  GitDirectoryComparisonLive,
  SourceHostProvidersLive,
  WorkspaceCatalogLive,
} from "@agentxm/workspace-kernel/sources/live";
import {
  AuthClientLive,
  AuthLoginInteractionLive,
  AuthMiddlewareLive,
  CredentialStoreLive,
  CredentialStoreSessionLive,
  PendingDeviceLoginStoreLive,
  SessionRefresherLive,
  TokenExchangeLive,
  WorkloadCredentialsLive,
} from "@agentxm/registry-access/adapters";
import { ambientCredentialSource } from "@agentxm/registry-access/credentials";
import { RegistryClientFactoryLive, RegistryUrl } from "@agentxm/registry-client";
import { detectCallerAgent } from "./telemetry/caller-agent.js";
import { resolveTelemetryMode, type TelemetryClientOptions } from "./telemetry/index.js";
import {
  SettingsReader,
  type RegistryTarget,
  type WorkspaceStateOptions,
  type SourceHostConfig,
} from "@agentxm/workspace-kernel/workspace-state";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import {
  layer as coreWorkspaceLayer,
  WorkspaceLocationLive,
} from "@agentxm/workspace-kernel/workspace-state/live";
import {
  decodeAbsolutePathSync,
  type AbsolutePath,
} from "@agentxm/extension-model/unstable/path-types";
import { ExecutionDirectory } from "./execution-directory.js";
import {
  UpgradePreparationLive,
  PackageInstallationLive,
  ScriptInstallationLive,
  InstallMetaLive,
  InstallMethodLive,
  SubprocessLive,
} from "@agentxm/cli-maintenance/self-update/composition/native";
import { LatestReleaseCheckLive } from "@agentxm/cli-maintenance/self-update/composition";

import { loadVersion } from "./version.js";
import { ScopedRoutes, failureForWorkspaceScope } from "./root/shared/scoped-command.js";
import { ScreenLoggerLive } from "./screen/index.js";
import { makeAxmSkillCompatibilityPolicyLayer } from "@agentxm/cli-maintenance/official-skill/composition";
import { ReleaseAgePosture } from "@agentxm/workspace-kernel/resolution";
import { AGENTXM_REGISTRY_URL } from "@agentxm/extension-model/unstable/recommendations/agent-extensions";

export { verboseFlag, debugFlag };

export const axmGlobalFlags = [
  nonInteractiveFlag,
  verboseFlag,
  debugFlag,
  quietFlag,
  jsonFlag,
  directoryFlag,
] as const;

// -- Runtime layers --
const LATEST_RELEASE_URL = "https://releases.axm.sh/latest.txt";
const registryUrlLayer = (registryUrl: string) => Layer.succeed(RegistryUrl, registryUrl);

export const withAxmUserAgent = (httpClient: HttpClient.HttpClient, version: string) =>
  httpClient.pipe(
    HttpClient.mapRequest(HttpClientRequest.setHeader("user-agent", `axm-cli/${version}`)),
  );

const fetchInputUrl = (input: string | URL | Request): string =>
  typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

/** Keep redirect policy at the runtime transport boundary that owns fetch. */
export const withAxmFetchPolicy =
  (fetchImplementation: typeof globalThis.fetch): typeof globalThis.fetch =>
  (input, init) => {
    const url = fetchInputUrl(input);
    const policy = /^https:\/\/api\.github\.com\/repos\/[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(url)
      ? ({ ...init, redirect: "error", credentials: "omit" } satisfies RequestInit)
      : url === LATEST_RELEASE_URL
        ? ({ ...init, redirect: "manual" } satisfies RequestInit)
        : init;
    return fetchImplementation(input, policy);
  };

const AxmFetchLayer = Layer.succeed(FetchHttpClient.Fetch, withAxmFetchPolicy(globalThis.fetch));

const AxmHttpClientLayer = Layer.provide(
  Layer.effect(
    HttpClient.HttpClient,
    Effect.map(HttpClient.HttpClient, (httpClient) => withAxmUserAgent(httpClient, loadVersion())),
  ),
  FetchHttpClient.layer.pipe(Layer.provide(AxmFetchLayer)),
);

/**
 * Node services and the plain AXM transport, with no Registry credentials.
 * Process-level observers such as telemetry build on this layer.
 */
export const makeArtifactHttpClientLayer = (fetchImplementation: typeof globalThis.fetch) =>
  Layer.effect(
    ArtifactHttpClient,
    Effect.map(HttpClient.HttpClient, (client) => withAxmUserAgent(client, loadVersion())),
  ).pipe(
    Layer.provide(
      FetchHttpClient.layer.pipe(
        Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetchImplementation)),
        Layer.provide(
          Layer.succeed(FetchHttpClient.RequestInit, {
            redirect: "manual",
            credentials: "omit",
          }),
        ),
      ),
    ),
  );

export const PlatformLayer = Layer.mergeAll(
  NodeServices.layer,
  AxmHttpClientLayer,
  makeArtifactHttpClientLayer(globalThis.fetch),
);
const registryRuntimeLayer = (registryUrl: string) =>
  Layer.mergeAll(PlatformLayer, registryUrlLayer(registryUrl));

const credentialStoreLayer = (registryUrl: string) =>
  Layer.provide(
    CredentialStoreSessionLive,
    Layer.provide(CredentialStoreLive, registryRuntimeLayer(registryUrl)),
  );

// Renewing and revoking a session are the calls that must not travel through
// the authenticated transport: the refresh grant is what the transport asks
// for while it is deciding which credential a request carries, and a revoke
// sent through it would renew the session it is ending. They are built on the
// plain client, and nothing else is.
const TokenExchangeLayer = Layer.provide(TokenExchangeLive, PlatformLayer);

// A GitHub Actions job's identity is exchanged for a workload token on the
// plain client too, and once per invocation: every layer below that resolves
// a credential leaves the exchange in its requirements, and the runner provides
// this one instance outside all of them.
const WorkloadCredentialsLayer = Layer.provide(
  WorkloadCredentialsLive,
  Layer.merge(PlatformLayer, TokenExchangeLayer),
);

const sessionRefreshLayer = (registryUrl: string) =>
  Layer.provide(
    SessionRefresherLive,
    Layer.mergeAll(TokenExchangeLayer, credentialStoreLayer(registryUrl)),
  );

/**
 * The transport every Registry call uses. It presents the invocation's
 * credential and keeps a stored session alive, so no caller decides for itself
 * whether it is authenticated — including the reads, which is what lets a
 * signed-in person see their own private extensions.
 */
const authenticatedHttpLayer = (registryUrl: string) =>
  Layer.provide(
    AuthMiddlewareLive,
    Layer.mergeAll(
      sessionRefreshLayer(registryUrl),
      credentialStoreLayer(registryUrl),
      registryRuntimeLayer(registryUrl),
    ),
  );

const authenticatedRuntimeLayer = (registryUrl: string) =>
  Layer.provideMerge(authenticatedHttpLayer(registryUrl), registryRuntimeLayer(registryUrl));

// Registry clients are constructed here, once, from the authenticated
// transport and the configured default registry; features keep the factory in
// `R`.
const registryClientFactoryLayer = (registryUrl: string) =>
  Layer.provide(RegistryClientFactoryLive, authenticatedRuntimeLayer(registryUrl));

const authServicesLayer = (registryUrl: string) =>
  Layer.provideMerge(
    Layer.mergeAll(PendingDeviceLoginStoreLive, AuthClientLive, TokenExchangeLayer),
    Layer.mergeAll(authenticatedRuntimeLayer(registryUrl), credentialStoreLayer(registryUrl)),
  );

export const makeAuthLayer = (registryUrl: string) =>
  Layer.mergeAll(authServicesLayer(registryUrl), authenticatedHttpLayer(registryUrl));

export const runtimeBaseLayer = Layer.mergeAll(
  NodeServices.layer,
  registryUrlLayer(AGENTXM_REGISTRY_URL),
  makeAxmSkillCompatibilityPolicyLayer(loadVersion()),
  // AuthLoginInteractionLive spawns platform commands via ChildProcessSpawner,
  // provided by NodeServices (memoized with the merged instance above).
  Layer.provide(AuthLoginInteractionLive, NodeServices.layer),
  Logger.layer([], { mergeWithExisting: false }),
);

const versionGlobalFlag = GlobalFlag.Action({
  flag: Flag.Boolean("version").pipe(
    Flag.withDescription("Show version information"),
    Flag.withDefault(false),
  ),
  run: Effect.fnUntraced(function* (_, context) {
    const formatter = yield* CliOutput.Formatter;
    yield* Console.log(formatter.formatVersion(context.command.name, context.version));
  }),
});

export const cliConfigLayer = CliConfig.layer({ builtIns: [GlobalFlag.Help, versionGlobalFlag] });

export const baseLayer = Layer.mergeAll(runtimeBaseLayer, PlatformLayer, cliConfigLayer);

/**
 * The self-update capability's environment-backed services. The startup
 * update check needs the release cache and latest-release discovery;
 * the `upgrade` command additionally drives an installer through a
 * subprocess and records what it installed.
 */
export const startupUpdateCheckLayer = Layer.provide(
  Layer.mergeAll(UpdateCheckCacheLive, LatestReleaseCheckLive),
  PlatformLayer,
);

export const selfUpdateLayer = Layer.provideMerge(
  Layer.mergeAll(UpgradePreparationLive, PackageInstallationLive, ScriptInstallationLive),
  Layer.mergeAll(
    InstallMethodLive,
    InstallMetaLive,
    SubprocessLive,
    UpdateCheckCacheLive,
    CliUpgradeObservationLive,
  ),
);

/** Route Effect diagnostics through the Screen's serialized transcript writer. */
export const makeCliLoggerLayer = (level: VerbosityLevel) => ScreenLoggerLive(level);

const makeRuntimeLoggerLayer = Layer.unwrap(
  Effect.map(Verbosity, (verbosity) => makeCliLoggerLayer(verbosity.level)),
);

interface RuntimeEnvConfig {
  readonly verbose: Option.Option<string>;
  readonly debug: Option.Option<string>;
}

export const getBuiltInSources = (): ReadonlyArray<SourceHostConfig> => [
  { name: "agentxm", type: "registry", location: new URL(AGENTXM_REGISTRY_URL) },
];

const readRuntimeEnvConfig = (): RuntimeEnvConfig => ({
  verbose: Option.fromUndefinedOr(process.env["AXM_VERBOSE"]),
  debug: Option.fromUndefinedOr(process.env["AXM_DEBUG"]),
});

const isPreviewRequest = (value: string | undefined): boolean => value === "1" || value === "true";

/**
 * The operator's telemetry consent and preview request for this process,
 * resolved once at the process entry from the environment (the process
 * environment unless another is given).
 */
export const resolveProcessTelemetryOptions = (
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Pick<TelemetryClientOptions, "mode" | "preview" | "client" | "detectCaller"> => ({
  mode: resolveTelemetryMode({
    doNotTrack: environment["DO_NOT_TRACK"],
    disableTelemetry: environment["DISABLE_TELEMETRY"],
    telemetry: environment["AXM_TELEMETRY"],
  }),
  preview: isPreviewRequest(environment["AXM_TELEMETRY_PREVIEW"]),
  detectCaller: detectCallerAgent(environment),
  client: { name: "cli", version: loadVersion() },
});

/**
 * The Registry this invocation binds its transport, credentials, and clients
 * to: the settings-selected default, read through the workspace's one target
 * owner before any command's own workspace boundary is reached.
 */
export const resolveDefaultRegistryTarget = (projectRoot: AbsolutePath) => {
  const stateLayer = Layer.provide(
    coreWorkspaceLayer({
      scope: "project",
      projectRoot,
      builtInSources: getBuiltInSources(),
      allowUninitialized: true,
    }),
    AgentPresenceProbeLive,
  );
  return Effect.scoped(
    Effect.gen(function* () {
      const settings = yield* SettingsReader;
      const selection = yield* settings.registryTarget(Option.none());
      if (Option.isNone(selection.url)) {
        return yield* makeAppError({
          code: "usage",
          detail: `Default registry source "${selection.name}" is not configured.`,
          recover: `Add a Registry source named "${selection.name}" or change defaultRegistry in axm.json.`,
        });
      }
      return { name: selection.name, url: selection.url.value } satisfies RegistryTarget;
    }).pipe(Effect.provide(stateLayer)),
  ).pipe(
    Effect.matchEffect({
      onFailure: (cause) =>
        cause instanceof AppError
          ? Effect.fail(cause)
          : // Settings validity belongs to the command's workspace boundary,
            // where its canonical path-aware diagnostic is preserved. Runtime
            // bootstrap only needs a safe transport default until that boundary
            // is reached.
            Effect.succeed({ name: "agentxm", url: AGENTXM_REGISTRY_URL } satisfies RegistryTarget),
      onSuccess: Effect.succeed,
    }),
  );
};

const makeWorkspaceProgramLayer = (workspace: Omit<WorkspaceStateOptions, "builtInSources">) => {
  // -- Workspace-state foundation --
  const wsLayer = Layer.provide(
    coreWorkspaceLayer({
      ...workspace,
      builtInSources: getBuiltInSources(),
    }),
    AgentPresenceProbeLive,
  );
  const agentRepositoryLayer = Layer.provide(CodingAgentRepositoryLive, wsLayer);
  const workspaceCatalogLayer = Layer.provide(
    WorkspaceCatalogLive,
    Layer.merge(wsLayer, agentRepositoryLayer),
  );
  const sourceProvidersLayer = Layer.provide(
    SourceHostProvidersLive,
    Layer.mergeAll(workspaceCatalogLayer, AxmSkillCandidateGateLive, RegistryResolutionPolicyLive),
  );
  const gitDirectoryComparisonLayer = Layer.provide(GitDirectoryComparisonLive, PlatformLayer);
  const workspaceServiceLayer = Layer.mergeAll(
    Layer.provide(NativeWriteAuthorityLive, wsLayer),
    wsLayer,
    workspaceCatalogLayer,
    sourceProvidersLayer,
    gitDirectoryComparisonLayer,
    agentRepositoryLayer,
    WorkspaceFailureConversionLive,
  );

  const extensionsLayer = Layer.merge(ExtensionKindsLive, KnowledgeIndexLive);
  const fullLayer = Layer.provideMerge(extensionsLayer, workspaceServiceLayer);
  const participantsLayer = Layer.provide(ProjectionParticipantsLive, fullLayer);
  const invariantFactsLayer = Layer.provide(
    WorkspaceInvariantFactsLive,
    Layer.merge(fullLayer, participantsLayer),
  );
  const configuredAgentOutcomesLayer = Layer.provide(
    ConfiguredAgentOutcomesProviderLive,
    fullLayer,
  );
  return Layer.mergeAll(fullLayer, invariantFactsLayer, configuredAgentOutcomesLayer);
};

/** Setup binds projection ports to its explicit scope before settings exist. */
export const setupProjectionLayer = (workspace: Omit<WorkspaceStateOptions, "builtInSources">) =>
  Layer.provide(
    Layer.mergeAll(CodingAgentRepositoryLive, NativeWriteAuthorityLive),
    WorkspaceLocationLive({ ...workspace, allowUninitialized: true }),
  );

const envToBool = (opt: Option.Option<string>): boolean =>
  isEnabledEnvRequest(Option.getOrUndefined(opt));

const resolveRuntimeConfig = () => {
  const envConfig = readRuntimeEnvConfig();
  return {
    envVerbose: envToBool(envConfig.verbose),
    envDebug: envToBool(envConfig.debug),
  } as const;
};

type CliWorkspaceOptions = Omit<WorkspaceStateOptions, "builtInSources" | "projectRoot"> & {
  readonly projectRoot?: AbsolutePath;
};

export const withWorkspace =
  (options: WorkspaceScope | CliWorkspaceOptions) =>
  <A, R>(program: Effect.Effect<A, ExpectedCliError, R>) =>
    Effect.gen(function* () {
      const executionDirectory = yield* ExecutionDirectory;
      const configured = typeof options === "string" ? { scope: options } : options;
      const resolved = {
        ...configured,
        projectRoot: configured.projectRoot ?? executionDirectory.path,
      } satisfies Omit<WorkspaceStateOptions, "builtInSources">;
      const wsLayer = makeWorkspaceProgramLayer(resolved);
      const scopedRoutes = Option.match(yield* Effect.serviceOption(ScopedRoutes), {
        onNone: (): ReadonlySet<string> => new Set(),
        onSome: ({ routes }) => routes,
      });
      // Naming the channel keeps the emitted declaration on the alias rather
      // than on every workspace failure it spans.
      const scopedFailure = (error: ExpectedCliError): ExpectedCliError =>
        failureForWorkspaceScope(error, resolved.scope, scopedRoutes);
      return yield* Effect.scoped(
        Layer.build(wsLayer).pipe(
          // Building the workspace reads its settings and state before the
          // command runs, so a failure here is a configuration failure.
          recordingConfigurationFailure(scopedFailure),
          Effect.flatMap((workspaceContext) =>
            Effect.provide(program, workspaceContext).pipe(Effect.mapError(scopedFailure)),
          ),
        ),
      ).pipe(
        Effect.ensuring(
          Effect.gen(function* () {
            const semanticProperties = yield* getCommandSemanticProperties;
            yield* setCommandSemanticProperties({
              ...semanticProperties,
              "cli.scope": resolved.scope,
            });
          }),
        ),
      );
    });

/**
 * Discharge the minimum-release-age posture at a command boundary.
 *
 * Every gated handler carries `ReleaseAgePosture` in `R` up to its command, so
 * a command the gate can block does not compile until it calls this helper —
 * and the argument is always its own parsed `--ignore-release-age` flag, never
 * a decision written here. A leaf can no longer settle a policy its command
 * never surfaced, and a newly gated command cannot ship without the override.
 */
export const withReleaseAgePosture =
  (ignoreReleaseAge: boolean) =>
  <A, E, R>(program: Effect.Effect<A, E, R>) =>
    Effect.provideService(program, ReleaseAgePosture, ignoreReleaseAge ? "ignore" : "enforce");

export const withRuntime =
  (command?: string) =>
  <A, R>(program: Effect.Effect<A, ExpectedCliError, R>) =>
    Effect.gen(function* () {
      const directory = yield* directoryFlag;
      const selected = Option.getOrElse(directory, () => process.cwd());
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directoryError = (cause: unknown) =>
        makeAppError({
          code: "usage",
          detail: `Could not run from the selected directory '${selected}'.`,
          cause,
        });
      const existing = yield* fs.realPath(selected).pipe(Effect.mapError(directoryError));
      const canonical = yield* resolveNativeReferent(existing).pipe(
        Effect.mapError(directoryError),
      );
      const info = yield* fs.stat(canonical).pipe(Effect.mapError(directoryError));
      if (info.type !== "Directory") {
        return yield* makeAppError({
          code: "usage",
          detail: `Could not run from the selected directory '${selected}'.`,
          cause: new Error("The selected path is not a directory."),
        });
      }
      yield* fs.stat(`${canonical}${path.sep}.`).pipe(Effect.mapError(directoryError));
      const executionDirectory = { path: decodeAbsolutePathSync(canonical) };
      const config = resolveRuntimeConfig();
      const defaultRegistry = yield* resolveDefaultRegistryTarget(executionDirectory.path);
      const format = yield* resolveCliFormat;
      // Only the recovery a refusal names depends on this, so a configuration
      // source that cannot be read leaves the Registry's own recovery rather
      // than failing the command; resolving the credential reports that
      // failure where it matters.
      const credentialSource = yield* ambientCredentialSource.pipe(
        Effect.catch(() => Effect.succeed(Option.none())),
      );
      const foundationLayer = makeFoundationLayer(format, {
        envVerbose: config.envVerbose,
        envDebug: config.envDebug,
      });
      // The foundation layer instance is shared with appLayer below, so the
      // interaction Lives observe the same renderer and verbosity services.
      const interactionLayer = Layer.provide(
        Layer.mergeAll(
          ResolvePlanInteractionLive,
          WorkspaceInitializationInteractionLive,
          AuthLoginPresenterLive,
          InterruptionSignalSourceLive,
          InstallSelectionLive,
          BundledAxmSkillAssetLive,
        ),
        foundationLayer,
      );
      const appLayer = Layer.provideMerge(
        makeRuntimeLoggerLayer,
        Layer.mergeAll(
          foundationLayer,
          interactionLayer,
          Layer.provide(WorkspaceTransactionScopesLive, PlatformLayer),
        ),
      );

      return yield* withCliErrorHandling(
        program.pipe(
          Effect.provideService(ExecutionDirectory, executionDirectory),
          Effect.provide(makeAuthLayer(defaultRegistry.url)),
          Effect.catchTag("RegistryAccessFailed", (error) => Effect.fail(failureToAppError(error))),
          Effect.mapError((error) =>
            error instanceof AppError
              ? appErrorForCredentialSource(credentialSource, error)
              : error,
          ),
          Effect.provideService(InvocationCredentialSource, credentialSource),
        ),
        { command, format },
      ).pipe(
        Effect.provide(appLayer),
        Effect.provide(
          Layer.mergeAll(
            authenticatedRuntimeLayer(defaultRegistry.url),
            registryClientFactoryLayer(defaultRegistry.url),
          ),
        ),
        Effect.provide(WorkloadCredentialsLayer),
        Effect.scoped,
        Effect.catchTag("RegistryAccessFailed", (error) => Effect.fail(failureToAppError(error))),
      );
    }).pipe(Effect.provide(WorkspaceFileWriteLocksLive));

// Machine-output decoding surface for JavaScript and TypeScript automation.
// The machine-output help topic points consumers here, so the published
// `axm.sh/runtime` entry re-exports the schema and kind detector.
export {
  MachineOutputDocumentSchema,
  detectMachineOutputDocumentKind,
} from "./cli-runtime/index.js";
