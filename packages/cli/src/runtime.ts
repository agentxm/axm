import * as NodeServices from "@effect/platform-node/NodeServices";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as Config from "effect/Config";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as References from "effect/References";
import { CliConfig, CliOutput, Flag, GlobalFlag } from "effect/unstable/cli";
import { pathToFileURL } from "node:url";

import {
  AppError,
  makeAppError,
  redactSensitiveValue,
} from "@agentxm/extension-management/unstable/app-error";

import {
  AgentPresenceProbeLive,
  AxmSkillCandidateGateLive,
  WorkspaceCatalogLive,
} from "@agentxm/extension-management/unstable/cli-runtime";
import {
  type CliTelemetryConfig,
  type ExpectedCliError,
  type OutputFormat,
  AuthLoginPresenterLive,
  getCommandSemanticProperties,
  InterruptionSignalSourceLive,
  makeFoundationLayer,
  ResolvePlanInteractionLive,
  resolveCliFormat,
  setCommandSemanticProperties,
  withCliErrorHandling,
  WorkspaceInitializationInteractionLive,
} from "@agentxm/extension-management/unstable/cli-runtime";
import {
  Verbosity,
  type VerbosityLevel,
  nonInteractiveFlag,
  jsonFlag,
  verboseFlag,
  debugFlag,
  quietFlag,
  directoryFlag,
  verbosityToLogLevel,
} from "@agentxm/extension-management/unstable/cli-flags";
import { SkillManagerLive } from "@agentxm/extension-management/unstable/skills";
import { makeAxmSkillCompatibilityPolicyLayer } from "@agentxm/extension-workspace";
import { PackManagerLive } from "@agentxm/extension-management/unstable/packs";
import {
  HookConfiguredAgentOutcomesProviderLive,
  HookManagerLive,
} from "@agentxm/extension-management/unstable/hooks";
import {
  KnowledgeIndexLive,
  KnowledgeManagerLive,
} from "@agentxm/extension-management/unstable/knowledge";
import { McpServerManagerLive } from "@agentxm/extension-management/unstable/mcps";
import { RuleManagerLive } from "@agentxm/extension-management/unstable/rules";
import { WorkspaceInvariantFactsLive } from "@agentxm/extension-management/unstable/projection";
import { SubagentManagerLive } from "@agentxm/extension-management/unstable/subagents";
import { SourceHostProvidersLive } from "@agentxm/extension-sources/live";
import { CodingAgentRepositoryLive } from "@agentxm/extension-workspace/live";
import {
  AuthClientLive,
  AuthLoginInteractionLive,
  AuthMiddlewareLive,
  CredentialStoreLive,
  CredentialStoreSessionLive,
  PendingDeviceLoginStoreLive,
} from "@agentxm/extension-management/unstable/auth";
import { RegistryUrl } from "@agentxm/registry-client";
import { resolveTelemetryMode } from "@agentxm/extension-management/unstable/telemetry";
import type { WorkspaceMutationsOptions } from "@agentxm/workspace-state";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import { layer as coreWorkspaceLayer } from "@agentxm/workspace-operations/live";
import { CliRenderer } from "@agentxm/extension-management/unstable/cli-renderer";
import type { SourceHostConfig } from "@agentxm/workspace-state";
import {
  decodeAbsolutePathSync,
  type AbsolutePath,
} from "@agentxm/extension-model/unstable/path-types";
import { ExecutionDirectory } from "./execution-directory.js";
import { loadVersion } from "./version.js";
import { suggestionsForScope } from "./root/shared/scoped-command.js";

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
// eslint-disable-next-line no-restricted-syntax -- A defaulted string is total; layer failure means the Config provider violated its contract.
const RegistryUrlLayer = Layer.orDie(
  Layer.effect(
    RegistryUrl,
    Config.string("AXM_REGISTRY_URL").pipe(Config.withDefault("https://registry.agentxm.ai")),
  ),
);

export const withAxmUserAgent = (httpClient: HttpClient.HttpClient, version: string) =>
  httpClient.pipe(
    HttpClient.mapRequest(HttpClientRequest.setHeader("user-agent", `axm-cli/${version}`)),
  );

const AxmHttpClientLayer = Layer.provide(
  Layer.effect(
    HttpClient.HttpClient,
    Effect.map(HttpClient.HttpClient, (httpClient) => withAxmUserAgent(httpClient, loadVersion())),
  ),
  FetchHttpClient.layer,
);

const PlatformLayer = Layer.mergeAll(NodeServices.layer, AxmHttpClientLayer);
const RegistryRuntimeLayer = Layer.mergeAll(PlatformLayer, RegistryUrlLayer);

const CredentialStoreLayer = Layer.provide(
  CredentialStoreSessionLive,
  Layer.provide(CredentialStoreLive, RegistryRuntimeLayer),
);

const AuthServicesLayer = Layer.provideMerge(
  Layer.mergeAll(PendingDeviceLoginStoreLive, AuthClientLive),
  Layer.mergeAll(RegistryRuntimeLayer, CredentialStoreLayer),
);

const AuthMiddlewareWrappedLayer = Layer.provide(
  AuthMiddlewareLive,
  Layer.mergeAll(AuthServicesLayer, PlatformLayer),
);

export const AuthLayer = Layer.mergeAll(AuthServicesLayer, AuthMiddlewareWrappedLayer);

export const runtimeBaseLayer = Layer.mergeAll(
  NodeServices.layer,
  RegistryUrlLayer,
  makeAxmSkillCompatibilityPolicyLayer(loadVersion()),
  // AuthLoginInteractionLive spawns platform commands via ChildProcessSpawner,
  // provided by NodeServices (memoized with the merged instance above).
  Layer.provide(AuthLoginInteractionLive, NodeServices.layer),
  Logger.layer([], { mergeWithExisting: false }),
);

const versionGlobalFlag = GlobalFlag.action({
  flag: Flag.boolean("version").pipe(
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
 * Verbosity-driven diagnostics always use stderr so structured command output
 * on stdout remains machine-readable. The minimum level tracks the full
 * verbosity ladder (quiet→Warn, normal→Info, verbose→Debug, debug→Trace).
 */
const formatMachineLogMessage = (message: unknown): string => {
  const redacted = redactSensitiveValue(message);
  if (typeof redacted === "string") return redacted;
  if (Array.isArray(redacted)) {
    return redacted
      .map((part) => (typeof part === "string" ? part : (JSON.stringify(part) ?? String(part))))
      .join(" ");
  }
  return JSON.stringify(redacted) ?? String(redacted);
};

const machineLogLevel = (level: Logger.Options<unknown>["logLevel"]) => {
  if (level === "Fatal" || level === "Error") return "error";
  if (level === "Warn") return "warn";
  return "info";
};

const machineLogger = Logger.withConsoleError(
  Logger.make((options) =>
    JSON.stringify({
      type: "log",
      level: machineLogLevel(options.logLevel),
      message: formatMachineLogMessage(options.message),
    }),
  ),
);

export const makeCliLoggerLayer = (level: VerbosityLevel, format: OutputFormat = "text") =>
  Layer.mergeAll(
    Logger.layer([format === "json" ? machineLogger : Logger.consolePretty()], {
      mergeWithExisting: false,
    }),
    Layer.succeed(References.LogToStderr, true),
    Layer.succeed(References.MinimumLogLevel, verbosityToLogLevel(level)),
  );

const makeRuntimeLoggerLayer = (format: OutputFormat) =>
  Layer.unwrap(Effect.map(Verbosity, (verbosity) => makeCliLoggerLayer(verbosity.level, format)));

interface RuntimeEnvConfig {
  readonly registryLocation: string;
  readonly registryUrl: string;
  readonly doNotTrack: Option.Option<string>;
  readonly telemetry: Option.Option<string>;
  readonly verbose: Option.Option<string>;
  readonly debug: Option.Option<string>;
}

const getNonEmptyEnv = (env: NodeJS.ProcessEnv, name: string): Option.Option<string> =>
  Option.fromUndefinedOr(env[name]).pipe(Option.filter((value) => value.length > 0));

const normalizeRegistryLocation = (location: string): string => {
  try {
    return new URL(location).href;
  } catch {
    return pathToFileURL(location).href;
  }
};

export const resolveBuiltInRegistryLocation = (
  env: NodeJS.ProcessEnv,
  registryUrl: string,
): string =>
  Option.match(getNonEmptyEnv(env, "AXM_REGISTRY_LOCATION"), {
    onNone: () => normalizeRegistryLocation(registryUrl),
    onSome: normalizeRegistryLocation,
  });

export const resolveBuiltInSources = Effect.gen(function* () {
  const registryUrl = yield* RegistryUrl;
  return getBuiltInSources(resolveBuiltInRegistryLocation(process.env, registryUrl));
});

export const getBuiltInSources = (registryLocation: string): ReadonlyArray<SourceHostConfig> => [
  { name: "agentxm", type: "registry", location: new URL(registryLocation) },
  { name: "github", type: "github", url: new URL("https://github.com") },
  { name: "gitlab", type: "gitlab", url: new URL("https://gitlab.com") },
  { name: "bitbucket", type: "bitbucket", url: new URL("https://bitbucket.org") },
];

const readRuntimeEnvConfig = Effect.gen(function* () {
  const registryUrl = yield* RegistryUrl;
  return {
    registryLocation: resolveBuiltInRegistryLocation(process.env, registryUrl),
    registryUrl,
    doNotTrack: Option.fromUndefinedOr(process.env["DO_NOT_TRACK"]),
    telemetry: Option.fromUndefinedOr(process.env["AXM_TELEMETRY"]),
    verbose: Option.fromUndefinedOr(process.env["AXM_VERBOSE"]),
    debug: Option.fromUndefinedOr(process.env["AXM_DEBUG"]),
  };
});

const makeCliTelemetryConfig = (envConfig: RuntimeEnvConfig): CliTelemetryConfig => ({
  mode: resolveTelemetryMode({
    doNotTrack: Option.getOrUndefined(envConfig.doNotTrack),
    telemetry: Option.getOrUndefined(envConfig.telemetry),
  }),
  client: { name: "cli", version: loadVersion() },
});

const makeWorkspaceProgramLayer = (
  registryLocation: string,
  workspace: Omit<WorkspaceMutationsOptions, "builtInSources">,
) => {
  // -- WorkspaceMutations foundation --
  const wsLayer = Layer.provide(
    coreWorkspaceLayer({
      ...workspace,
      builtInSources: getBuiltInSources(registryLocation),
    }),
    AgentPresenceProbeLive,
  );
  const workspaceCatalogLayer = Layer.provide(
    WorkspaceCatalogLive,
    Layer.merge(wsLayer, CodingAgentRepositoryLive),
  );
  const sourceProvidersLayer = Layer.provide(
    SourceHostProvidersLive,
    Layer.merge(workspaceCatalogLayer, AxmSkillCandidateGateLive),
  );
  const workspaceServiceLayer = Layer.mergeAll(
    wsLayer,
    workspaceCatalogLayer,
    sourceProvidersLayer,
    CodingAgentRepositoryLive,
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
  const invariantFactsLayer = Layer.provide(WorkspaceInvariantFactsLive, fullLayer);
  const configuredAgentOutcomesLayer = Layer.provide(
    HookConfiguredAgentOutcomesProviderLive,
    fullLayer,
  );
  return Layer.mergeAll(fullLayer, invariantFactsLayer, configuredAgentOutcomesLayer);
};

const envToBool = (opt: Option.Option<string>): boolean =>
  Option.match(opt, {
    onNone: () => false,
    onSome: (v) => v === "1" || v === "true",
  });

const resolveRuntimeConfig = () =>
  Effect.gen(function* () {
    const envConfig = yield* readRuntimeEnvConfig;

    return {
      envConfig,
      envVerbose: envToBool(envConfig.verbose),
      envDebug: envToBool(envConfig.debug),
      telemetryConfig: makeCliTelemetryConfig(envConfig),
    } as const;
  });

type CliWorkspaceOptions = Omit<WorkspaceMutationsOptions, "builtInSources" | "projectRoot"> & {
  readonly projectRoot?: AbsolutePath;
};

export const withWorkspace =
  (options: WorkspaceScope | CliWorkspaceOptions) =>
  <A, R>(program: Effect.Effect<A, ExpectedCliError, R>) =>
    Effect.gen(function* () {
      const envConfig = yield* readRuntimeEnvConfig;
      const executionDirectory = yield* ExecutionDirectory;
      const configured = typeof options === "string" ? { scope: options } : options;
      const resolved = {
        ...configured,
        projectRoot: configured.projectRoot ?? executionDirectory.path,
      } satisfies Omit<WorkspaceMutationsOptions, "builtInSources">;
      const wsLayer = makeWorkspaceProgramLayer(envConfig.registryLocation, resolved);
      const renderer = yield* CliRenderer;
      return yield* Effect.scoped(
        renderer
          .withSpinner(`Loading ${resolved.scope} workspace`, () => Layer.build(wsLayer), {
            successMessage: `Loaded ${resolved.scope} workspace`,
          })
          .pipe(Effect.flatMap((workspaceContext) => Effect.provide(program, workspaceContext))),
      ).pipe(
        Effect.mapError((error) => {
          if (error._tag !== "AppError" || error.suggestions === undefined) return error;
          return new AppError({
            code: error.code,
            title: error.title,
            detail: error.detail,
            ...(error.metadata === undefined ? {} : { metadata: error.metadata }),
            ...(error.status === undefined ? {} : { status: error.status }),
            ...(error.retryable === undefined ? {} : { retryable: error.retryable }),
            ...(error.blockedOn === undefined ? {} : { blockedOn: error.blockedOn }),
            ...(error.action === undefined ? {} : { action: error.action }),
            suggestions: suggestionsForScope(error.suggestions, resolved.scope),
            cause: error.cause,
          });
        }),
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
      const config = yield* resolveRuntimeConfig();
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
        ),
        foundationLayer,
      );
      // The coding-agent repository is context-free and serves commands that
      // run before a workspace exists (setup); workspace-bound commands get
      // the same layer again through withWorkspace, harmlessly.
      const appLayer = Layer.provideMerge(
        makeRuntimeLoggerLayer(format),
        Layer.mergeAll(foundationLayer, interactionLayer, CodingAgentRepositoryLive),
      );

      return yield* withCliErrorHandling(
        program.pipe(
          Effect.provideService(ExecutionDirectory, executionDirectory),
          Effect.provide(AuthLayer),
        ),
        {
          command,
          format,
          telemetryConfig: config.telemetryConfig,
        },
      ).pipe(Effect.provide(appLayer), Effect.scoped);
    }).pipe(Effect.provide(RegistryRuntimeLayer));
