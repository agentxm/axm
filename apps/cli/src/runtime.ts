import {
  WorkspaceTransactionScopesLive,
  WorkspaceFileWriteLocksLive,
} from "@agentxm/workspace/transitions/settlement/live";
import { UpdateCheckCacheLive } from "./cli-runtime/update-cache.js";
import { CliUpgradeObservationLive } from "./cli-runtime/upgrade-observation.js";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { CliConfig, CliOutput, Flag, GlobalFlag } from "effect/unstable/cli";

import { AppError, makeAppError } from "./app-error/index.js";

import { AgentPresenceProbeLive } from "@agentxm/workspace/projection/agent-adapters/live";
import { RegistryResolutionPolicyLive } from "./cli-runtime/index.js";
import { AxmSkillCandidateGateLive } from "@agentxm/workspace/resolution/live";
import { WorkspaceCatalogLive } from "@agentxm/workspace/projection/live";
import {
  BundledAxmSkillAssetLive,
  type CliTelemetryConfig,
  ExtensionSelectionLive,
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

import { ConfiguredAgentOutcomesProviderLive } from "@agentxm/workspace/lifecycle/live";
import {
  HookManagerLive,
  KnowledgeManagerLive,
  McpSecretStoreLive,
  McpServerManagerLive,
  PackManagerLive,
  RuleManagerLive,
  SkillManagerLive,
  SubagentManagerLive,
} from "@agentxm/workspace/materialization/live";
import { ProjectionParticipantsLive } from "@agentxm/workspace/materialization/live";
import { KnowledgeIndexLive } from "@agentxm/workspace/knowledge/query/live";
import { WorkspaceInvariantFactsLive } from "@agentxm/workspace/projection/live";
import { AuthLoginPresenterLive } from "./auth-login-presenter.js";
import { registryAccessFailedToAppError } from "./feature-errors.js";
import { LifecycleFailureConversionLive } from "@agentxm/workspace/lifecycle";
import { ReconciliationFailureConversionLive } from "@agentxm/workspace/reconciliation";
import { WorkspaceInitializationInteractionLive } from "./workspace-initialization-interaction-live.js";
import {
  GitDirectoryComparisonLive,
  SourceHostProvidersLive,
} from "@agentxm/workspace/resolution/sources/live";
import {
  CodingAgentRepositoryLive,
  NativeWriteAuthorityLive,
} from "@agentxm/workspace/projection/live";
import {
  AuthClientLive,
  AuthLoginInteractionLive,
  AuthMiddlewareLive,
  CredentialStoreLive,
  CredentialStoreSessionLive,
  PendingDeviceLoginStoreLive,
  SessionRefresherLive,
  TokenExchangeLive,
} from "@agentxm/registry-access/adapters";
import { RegistryClientFactoryLive, RegistryUrl } from "@agentxm/registry-client";
import { resolveTelemetryMode } from "./telemetry/index.js";
import { SettingsReader, type WorkspaceStateOptions } from "@agentxm/workspace/desired-state";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import { layer as coreWorkspaceLayer } from "@agentxm/workspace/desired-state/live";
import type { SourceHostConfig } from "@agentxm/workspace/desired-state";
import {
  decodeAbsolutePathSync,
  type AbsolutePath,
} from "@agentxm/extension-model/unstable/path-types";
import { ExecutionDirectory } from "./execution-directory.js";
import {
  DefaultRegistryTarget,
  type DefaultRegistryTargetService,
} from "./default-registry-target.js";
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
import { failureForWorkspaceScope } from "./root/shared/scoped-command.js";
import { ScreenLoggerLive } from "./screen/index.js";
import { makeAxmSkillCompatibilityPolicyLayer } from "@agentxm/cli-maintenance/official-skill/composition";
import { ReleaseAgePosture } from "@agentxm/workspace/resolution";
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
const GITHUB_LATEST_RELEASE_URL = "https://github.com/agentxm/axm/releases/latest";
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
  (input, init) =>
    fetchImplementation(
      input,
      fetchInputUrl(input) === GITHUB_LATEST_RELEASE_URL ? { ...init, redirect: "manual" } : init,
    );

const AxmFetchLayer = Layer.succeed(FetchHttpClient.Fetch, withAxmFetchPolicy(globalThis.fetch));

const AxmHttpClientLayer = Layer.provide(
  Layer.effect(
    HttpClient.HttpClient,
    Effect.map(HttpClient.HttpClient, (httpClient) => withAxmUserAgent(httpClient, loadVersion())),
  ),
  FetchHttpClient.layer.pipe(Layer.provide(AxmFetchLayer)),
);

const PlatformLayer = Layer.mergeAll(NodeServices.layer, AxmHttpClientLayer);
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
  readonly doNotTrack: Option.Option<string>;
  readonly telemetry: Option.Option<string>;
  readonly verbose: Option.Option<string>;
  readonly debug: Option.Option<string>;
}

export const getBuiltInSources = (): ReadonlyArray<SourceHostConfig> => [
  { name: "agentxm", type: "registry", location: new URL(AGENTXM_REGISTRY_URL) },
];

const readRuntimeEnvConfig = (): RuntimeEnvConfig => ({
  doNotTrack: Option.fromUndefinedOr(process.env["DO_NOT_TRACK"]),
  telemetry: Option.fromUndefinedOr(process.env["AXM_TELEMETRY"]),
  verbose: Option.fromUndefinedOr(process.env["AXM_VERBOSE"]),
  debug: Option.fromUndefinedOr(process.env["AXM_DEBUG"]),
});

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
      const name = yield* settings.defaultRegistry;
      const source = yield* settings.sourceByName(name);
      if (Option.isNone(source) || source.value.type !== "registry") {
        return yield* makeAppError({
          code: "usage",
          detail: `Default registry source "${name}" is not configured.`,
          recover: `Add a Registry source named "${name}" or change defaultRegistry in axm.json.`,
        });
      }
      const location = source.value.location;
      return {
        name,
        url: location.protocol === "file:" ? location.href : location.origin,
      } satisfies DefaultRegistryTargetService;
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
            Effect.succeed({
              name: "agentxm",
              url: AGENTXM_REGISTRY_URL,
            } satisfies DefaultRegistryTargetService),
      onSuccess: Effect.succeed,
    }),
  );
};

const makeCliTelemetryConfig = (envConfig: RuntimeEnvConfig): CliTelemetryConfig => ({
  mode: resolveTelemetryMode({
    doNotTrack: Option.getOrUndefined(envConfig.doNotTrack),
    telemetry: Option.getOrUndefined(envConfig.telemetry),
  }),
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
  const workspaceCatalogLayer = Layer.provide(
    WorkspaceCatalogLive,
    Layer.merge(wsLayer, CodingAgentRepositoryLive),
  );
  const sourceProvidersLayer = Layer.provide(
    SourceHostProvidersLive,
    Layer.mergeAll(workspaceCatalogLayer, AxmSkillCandidateGateLive, RegistryResolutionPolicyLive),
  );
  const gitDirectoryComparisonLayer = Layer.provide(GitDirectoryComparisonLive, PlatformLayer);
  const workspaceServiceLayer = Layer.mergeAll(
    NativeWriteAuthorityLive,
    wsLayer,
    workspaceCatalogLayer,
    sourceProvidersLayer,
    gitDirectoryComparisonLayer,
    CodingAgentRepositoryLive,
    LifecycleFailureConversionLive,
    ReconciliationFailureConversionLive,
    McpSecretStoreLive,
  );

  // Leaf managers are independent. Packs depend on the other managers.
  const coreExtensions = Layer.mergeAll(
    RuleManagerLive,
    HookManagerLive,
    McpServerManagerLive,
    SkillManagerLive,
    SubagentManagerLive,
    KnowledgeManagerLive,
    KnowledgeIndexLive,
  );
  const extensionsLayer = Layer.provideMerge(PackManagerLive, coreExtensions);
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

const envToBool = (opt: Option.Option<string>): boolean =>
  isEnabledEnvRequest(Option.getOrUndefined(opt));

const resolveRuntimeConfig = () => {
  const envConfig = readRuntimeEnvConfig();
  return {
    envConfig,
    envVerbose: envToBool(envConfig.verbose),
    envDebug: envToBool(envConfig.debug),
    telemetryConfig: makeCliTelemetryConfig(envConfig),
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
      return yield* Effect.scoped(
        Layer.build(wsLayer).pipe(
          Effect.flatMap((workspaceContext) => Effect.provide(program, workspaceContext)),
        ),
      ).pipe(
        Effect.mapError((error) => failureForWorkspaceScope(error, resolved.scope)),
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
      const canonical = yield* fs.realPath(selected).pipe(Effect.mapError(directoryError));
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
          ExtensionSelectionLive,
          BundledAxmSkillAssetLive,
        ),
        foundationLayer,
      );
      // The coding-agent repository is context-free and serves commands that
      // run before a workspace exists (setup); workspace-bound commands get
      // the same layer again through withWorkspace, harmlessly.
      const appLayer = Layer.provideMerge(
        makeRuntimeLoggerLayer,
        Layer.mergeAll(
          foundationLayer,
          interactionLayer,
          CodingAgentRepositoryLive,
          Layer.provide(WorkspaceTransactionScopesLive, PlatformLayer),
        ),
      );

      return yield* withCliErrorHandling(
        program.pipe(
          Effect.provideService(ExecutionDirectory, executionDirectory),
          Effect.provideService(DefaultRegistryTarget, defaultRegistry),
          Effect.provide(makeAuthLayer(defaultRegistry.url)),
          Effect.catchTag("RegistryAccessFailed", (error) =>
            Effect.fail(registryAccessFailedToAppError(error)),
          ),
        ),
        {
          command,
          format,
          telemetryConfig: config.telemetryConfig,
        },
      ).pipe(
        Effect.provide(appLayer),
        Effect.provide(
          Layer.mergeAll(
            authenticatedRuntimeLayer(defaultRegistry.url),
            registryClientFactoryLayer(defaultRegistry.url),
          ),
        ),
        Effect.scoped,
        Effect.catchTag("RegistryAccessFailed", (error) =>
          Effect.fail(registryAccessFailedToAppError(error)),
        ),
      );
    }).pipe(Effect.provide(WorkspaceFileWriteLocksLive));

// Machine-output decoding surface for JavaScript and TypeScript automation.
// The machine-output help topic points consumers here, so the published
// `axm.sh/runtime` entry re-exports the schema and kind detector.
export {
  MachineOutputDocumentSchema,
  detectMachineOutputDocumentKind,
} from "./cli-runtime/index.js";
