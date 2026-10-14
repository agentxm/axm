import { axmBooleanEnabled } from "@agentxm/host-primitives";
import { CanonicalNativePathLive } from "@agentxm/workspace-kernel/locations/live";
import { ArtifactHttpClient } from "@agentxm/workspace-kernel/sources";
import { resolveNativeReferent } from "@agentxm/workspace-kernel/locations";
import {
  WorkspaceTransactionScopesLive,
  WorkspaceFileWriteLocksLive,
} from "@agentxm/workspace-kernel/settlement/live";
import type { WorkspaceFileWriteLocks } from "@agentxm/workspace-kernel/settlement";
import { UpdateCheckCacheLive } from "./cli-runtime/update-cache.js";
import { CliUpgradeObservationLive } from "./cli-runtime/upgrade-observation.js";
import { recordingConfigurationFailure } from "./cli-runtime/configuration-failure.js";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { CliConfig, CliOutput, Flag, GlobalFlag } from "effect/cli";

import { AppError, makeAppError } from "./app-error/index.js";

import {
  detectAgentScopeResults,
  type AgentScopeDetection,
} from "@agentxm/workspace-kernel/agent-adapters";
import { ConfigurableAgentIdSchema } from "@agentxm/extension-model/unstable/extensions/common";
import * as Schema from "effect/Schema";
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
  verboseFlag,
  debugFlag,
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
  CredentialStoreLive,
  CredentialStoreSessionLive,
  PendingDeviceLoginStoreLive,
  RegistryRequestAuthorizationLive,
  SessionRefresherLive,
  TokenExchangeLive,
  WorkloadCredentialsLive,
} from "@agentxm/registry-access/adapters";
import { ambientCredentialSource } from "@agentxm/registry-access/credentials";
import {
  RegistryClientFactoryLive,
  RegistryContext,
  RegistryHttpClient,
  RegistrySelectionFailed,
  type RegistryContextService,
  type RegistrySelectionFailure,
} from "@agentxm/registry-client";
import { decodeRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import { detectCallerAgent } from "./telemetry/caller-agent.js";
import { resolveTelemetryMode, type TelemetryClientOptions } from "./telemetry/index.js";
import {
  resolveUserWorkspaceRoot,
  selectRegistry,
  type WorkspaceStateOptions,
  type SourceHostConfig,
} from "@agentxm/workspace-kernel/workspace-state";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import {
  layer as coreWorkspaceLayer,
  readProjectSourceConfiguration,
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
import { Screen, ScreenLoggerLive, headlineDoc } from "./screen/index.js";
import {
  WorkspaceInitializationInteraction,
  undetectedAgentOffer,
} from "@agentxm/workspace-features/configuration";
import { makeAxmSkillCompatibilityPolicyLayer } from "@agentxm/cli-maintenance/official-skill/composition";
import { ReleaseAgePosture } from "@agentxm/workspace-kernel/resolution";
import {
  ProjectionOutputPosture,
  type ProjectionOutputPostureValue,
} from "@agentxm/workspace-kernel/projection";
import { AGENTXM_REGISTRY_URL } from "@agentxm/extension-model/unstable/recommendations/agent-extensions";

export { verboseFlag, debugFlag };

export { axmGlobalFlags } from "./cli-flags/index.js";

// -- Runtime layers --
const LATEST_RELEASE_URL = "https://releases.axm.sh/latest.txt";

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

/**
 * The plain Registry transport. Redirects are left unfollowed so every
 * Registry client can refuse them: a request — and any credential it carries —
 * is never replayed to wherever a response points.
 */
export const makeRegistryHttpClientLayer = (fetchImplementation: typeof globalThis.fetch) =>
  Layer.effect(
    RegistryHttpClient,
    Effect.map(HttpClient.HttpClient, (client) => withAxmUserAgent(client, loadVersion())),
  ).pipe(
    Layer.provide(
      FetchHttpClient.layer.pipe(
        Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetchImplementation)),
        Layer.provide(Layer.succeed(FetchHttpClient.RequestInit, { redirect: "manual" })),
      ),
    ),
  );

export const PlatformLayer = Layer.mergeAll(
  NodeServices.layer,
  CanonicalNativePathLive,
  AxmHttpClientLayer,
  makeArtifactHttpClientLayer(globalThis.fetch),
  makeRegistryHttpClientLayer(globalThis.fetch),
);

const credentialStoreLayer = Layer.provide(
  CredentialStoreSessionLive,
  Layer.provide(CredentialStoreLive, PlatformLayer),
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

const sessionRefreshLayer = Layer.provide(
  SessionRefresherLive,
  Layer.mergeAll(TokenExchangeLayer, credentialStoreLayer),
);

/**
 * How every Registry request acquires its credential. The client factory
 * applies it per Registry, so it presents the invocation's credential and keeps
 * a stored session alive for the reads too — which is what lets a signed-in
 * person see their own private extensions — and never reaches a request that
 * is not a Registry's.
 */
const requestAuthorizationLayer = Layer.provide(
  RegistryRequestAuthorizationLive,
  Layer.mergeAll(sessionRefreshLayer, credentialStoreLayer, PlatformLayer),
);

// Registry clients are constructed here, once, over the Registry transport and
// its authorization; features keep the factory in `R` and name the endpoint.
const registryClientFactoryLayer = Layer.provide(
  RegistryClientFactoryLive,
  Layer.merge(requestAuthorizationLayer, PlatformLayer),
);

/**
 * Every Registry service an invocation composes. Nothing here reads settings
 * or selects a Registry: that happens the first time a command asks the
 * `RegistryContext` it requires.
 */
export const registryAccessLayer = Layer.provideMerge(
  Layer.mergeAll(PendingDeviceLoginStoreLive, AuthClientLive, TokenExchangeLayer),
  Layer.mergeAll(registryClientFactoryLayer, credentialStoreLayer, PlatformLayer),
);

/**
 * The invocation's Registry selection, decided lazily and at most once from
 * the execution directory's project and user settings. A selection that cannot
 * be made is a typed failure recorded as a configuration failure; nothing
 * falls back to another Registry.
 */
export const makeRegistryContextLayer = (
  projectRoot: AbsolutePath,
  explicit: Option.Option<string>,
  builtInSources: ReadonlyArray<SourceHostConfig> = getBuiltInSources(),
): Layer.Layer<
  RegistryContext,
  never,
  FileSystem.FileSystem | Path.Path | WorkspaceFileWriteLocks
> =>
  Layer.effect(
    RegistryContext,
    Effect.gen(function* () {
      // The selection is read later, from whichever command first asks; it
      // reads the settings through the invocation's own file services and
      // write locks, under the configuration it was composed with.
      const services = yield* Effect.context<
        FileSystem.FileSystem | Path.Path | WorkspaceFileWriteLocks
      >();
      const configProvider = yield* ConfigProvider.ConfigProvider;
      const snapshot = yield* Effect.cached(
        readProjectSourceConfiguration({ projectRoot, builtInSources }).pipe(
          Effect.provide(services),
          Effect.provideService(ConfigProvider.ConfigProvider, configProvider),
          Effect.mapError(
            (cause) =>
              new RegistrySelectionFailed({
                detail: "The settings that select the Registry could not be read.",
                cause,
              }),
          ),
        ),
      );
      const select = (selector: Option.Option<string>) =>
        snapshot.pipe(
          Effect.flatMap((current) => Effect.fromResult(selectRegistry(current, selector))),
          recordingConfigurationFailure((error: RegistrySelectionFailure) => error),
        );
      const bound = yield* Effect.cached(select(explicit));
      const defaultBound = yield* Effect.cached(select(Option.none()));
      return { bound, defaultBound, target: select } satisfies RegistryContextService;
    }),
  );

export const runtimeBaseLayer = Layer.mergeAll(
  NodeServices.layer,
  CanonicalNativePathLive,
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
  { name: "agentxm", type: "registry", location: decodeRegistryEndpointSync(AGENTXM_REGISTRY_URL) },
];

const readRuntimeEnvConfig = (): RuntimeEnvConfig => ({
  verbose: Option.fromUndefinedOr(process.env["AXM_VERBOSE"]),
  debug: Option.fromUndefinedOr(process.env["AXM_DEBUG"]),
});

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
  preview: axmBooleanEnabled(environment["AXM_TELEMETRY_PREVIEW"]),
  detectCaller: detectCallerAgent(environment),
  client: { name: "cli", version: loadVersion() },
});

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
  axmBooleanEnabled(Option.getOrUndefined(opt));

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

const NO_AGENTS_DETECTED = "No coding agents were detected for this workspace";

/**
 * The refusal a first install ends with when it has no agents and cannot ask.
 * A request that also left its selection open names both flags at once, so an
 * unattended caller is not refused a second time for the selection.
 */
export const undetectedAgentsRefusal = (selectionOpen = false) =>
  makeAppError({
    code: "usage",
    detail: NO_AGENTS_DETECTED,
    recover: selectionOpen
      ? "Retry with --agent <agent-id>, for example --agent claude-code, and name what to install with a selector flag or --all"
      : "Retry with --agent <agent-id>, for example --agent claude-code",
  });

/** Whether this invocation can open the question a first install asks about agents. */
export const canAskUndetectedAgents = Effect.gen(function* () {
  const screen = yield* Effect.serviceOption(Screen);
  const interaction = yield* Effect.serviceOption(WorkspaceInitializationInteraction);
  if (Option.isNone(screen) || Option.isNone(interaction)) return false;
  return yield* screen.value.canAsk.pipe(
    Effect.mapError((cause) =>
      makeAppError({
        code: "internal",
        detail: "Interaction configuration could not be read.",
        cause,
      }),
    ),
  );
});

const configurableAgents = (ids: ReadonlyArray<string>) =>
  ids.flatMap((id) => (Schema.is(ConfigurableAgentIdSchema)(id) ? [id] : []));

/**
 * The agents a person chooses for a first install whose project names none.
 * Where no question can open, or the answer is nobody, the install refuses
 * with the flag that names them instead.
 */
export const chooseUndetectedAgents = (detections: ReadonlyArray<AgentScopeDetection>) =>
  Effect.gen(function* () {
    const screen = yield* Effect.serviceOption(Screen);
    const interaction = yield* Effect.serviceOption(WorkspaceInitializationInteraction);
    if (Option.isNone(screen) || Option.isNone(interaction) || !(yield* canAskUndetectedAgents)) {
      return yield* undetectedAgentsRefusal();
    }
    yield* screen.value.note(
      headlineDoc("info", "No coding agents were detected in this project."),
    );
    const agents = configurableAgents(
      yield* interaction.value.selectAgents(undetectedAgentOffer(detections)),
    );
    if (agents.length === 0) return yield* undetectedAgentsRefusal();
    return agents;
  });

/**
 * What an install knows about its scope's agents before a workspace opens: the
 * scope already has settings, its project names agents, or it names none.
 */
export const observeFirstInstallAgents = (scope: WorkspaceScope, projectRoot?: AbsolutePath) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const project = projectRoot ?? (yield* ExecutionDirectory).path;
    const root = scope === "user" ? yield* resolveUserWorkspaceRoot() : project;
    const exists = yield* fs.exists(path.join(root, "axm.json")).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "internal",
          detail: "Could not inspect workspace settings",
          cause,
        }),
      ),
    );
    if (exists) return { _tag: "Established" } as const;
    const detections = yield* detectAgentScopeResults(project).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "internal",
          detail: "Could not detect coding agents",
          cause,
        }),
      ),
    );
    const agents = configurableAgents(
      detections.flatMap(({ agent, project: detected }) => (detected ? [agent.id] : [])),
    );
    return agents.length > 0
      ? ({ _tag: "Detected", agents } as const)
      : ({ _tag: "Undetected", detections } as const);
  });

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
      // A workspace opened inside another shares its layer memoization, and
      // services bound to the outer location would answer for this one. Each
      // boundary builds its own.
      return yield* Effect.scoped(
        Layer.build(Layer.fresh(wsLayer)).pipe(
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

/**
 * Discharge the whole-file projection overrides at a command boundary.
 *
 * A command passes only the flags it registers, always as its own parsed
 * values: a field it omits keeps that policy and tells every recovery not to
 * name a flag this command does not accept.
 */
export const withProjectionOutputPosture =
  (posture: ProjectionOutputPostureValue) =>
  <A, E, R>(program: Effect.Effect<A, E, R>) =>
    Effect.provideService(program, ProjectionOutputPosture, posture);

export const withRuntime =
  (command?: string, options?: { readonly registry?: Option.Option<string> }) =>
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
        Effect.provide(registryAccessLayer),
        Effect.provide(WorkloadCredentialsLayer),
        Effect.provide(
          makeRegistryContextLayer(executionDirectory.path, options?.registry ?? Option.none()),
        ),
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
export { MachineEventSchema, type MachineEvent } from "./screen/machine-events.js";

export {
  ConfiguredAgentOutcomeSchema,
  ConfiguredAgentReasonCodeSchema,
  type ConfiguredAgentOutcome,
  type ConfiguredAgentReasonCode,
} from "@agentxm/workspace-kernel/operations";
