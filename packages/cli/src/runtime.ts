import * as NodeServices from "@effect/platform-node/NodeServices";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as Config from "effect/Config";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as Option from "effect/Option";
import * as References from "effect/References";
import { CliConfig, CliOutput, Flag, GlobalFlag } from "effect/unstable/cli";
import { pathToFileURL } from "node:url";

import { AppError } from "@agentxm/client-core/unstable/app-error";
import type { PromptCancelled } from "@agentxm/client-core/unstable/prompt-cancelled";

import {
  type CliTelemetryConfigService,
  getCommandSemanticProperties,
  makeFoundationLayer,
  resolveCliFormat,
  setCommandSemanticProperties,
  withCliErrorHandling,
} from "@agentxm/client-core/unstable/cli-runtime";
import {
  Verbosity,
  nonInteractiveFlag,
  jsonFlag,
  verboseFlag,
  debugFlag,
  quietFlag,
  verbosityToLogLevel,
} from "@agentxm/client-core/unstable/cli-flags";
import {
  makeAxmSkillCompatibilityPolicyLayer,
  SkillManagerLive,
} from "@agentxm/client-core/unstable/skills";
import { PackManagerLive } from "@agentxm/client-core/unstable/packs";
import { HookManagerLive } from "@agentxm/client-core/unstable/hooks";
import { KnowledgeManagerLive } from "@agentxm/client-core/unstable/knowledge";
import { McpServerManagerLive } from "@agentxm/client-core/unstable/mcps";
import { RuleManagerLive } from "@agentxm/client-core/unstable/rules";
import { SubagentManagerLive } from "@agentxm/client-core/unstable/subagents";
import { SourceHostProvidersLive } from "@agentxm/client-core/unstable/source-resolution";
import { CodingAgentRepositoryLive } from "@agentxm/client-core/unstable/agents";
import {
  AuthClientLive,
  AuthGuardInteractionLive,
  AuthLoginInteractionLive,
  AuthMiddlewareLive,
  CredentialStoreLive,
  CredentialStoreSessionLive,
  PendingDeviceLoginStoreLive,
  RegistryUrl,
} from "@agentxm/client-core/unstable/auth";
import { InstallHookCommandWorkflowActionsLive } from "./root/hooks/install/command-actions.js";
import { UninstallHookCommandWorkflowActionsLive } from "./root/hooks/uninstall/command-actions.js";
import { InstallKnowledgeCommandWorkflowActionsLive } from "./root/knowledge/install/command-actions.js";
import { UninstallKnowledgeCommandWorkflowActionsLive } from "./root/knowledge/uninstall/command-actions.js";
import { InstallMcpServerCommandWorkflowActionsLive } from "./root/mcps/install/command-actions.js";
import { UninstallMcpServerCommandWorkflowActionsLive } from "./root/mcps/uninstall/command-actions.js";
import { InstallPackCommandWorkflowActionsLive } from "./root/packs/install/command-actions.js";
import { UninstallPackCommandWorkflowActionsLive } from "./root/packs/uninstall/command-actions.js";
import { InstallRuleCommandWorkflowActionsLive } from "./root/rules/install/command-actions.js";
import { UninstallRuleCommandWorkflowActionsLive } from "./root/rules/uninstall/command-actions.js";
import { InstallSkillCommandWorkflowActionsLive } from "./root/skills/install/command-actions.js";
import { UninstallSkillCommandWorkflowActionsLive } from "./root/skills/uninstall/command-actions.js";
import { InstallSubagentCommandWorkflowActionsLive } from "./root/subagents/install/command-actions.js";
import { UninstallSubagentCommandWorkflowActionsLive } from "./root/subagents/uninstall/command-actions.js";
import { resolveTelemetryMode } from "@agentxm/client-core/unstable/telemetry";
import type {
  WorkspaceMutationsOptions,
  WorkspaceScope,
} from "@agentxm/client-core/unstable/workspace";
import {
  layer as coreWorkspaceLayer,
  ResolvePlanInteractionLive,
  withDegradedLockfileReads,
  WorkspaceInitializationInteractionLive,
  WorkspaceMutations,
} from "@agentxm/client-core/unstable/workspace";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import type { SourceHostConfig } from "@agentxm/client-core/unstable/settings";
import { loadVersion } from "./version.js";
import { suggestionsForScope } from "./root/shared/scoped-command.js";

export { verboseFlag, debugFlag };

export const axmGlobalFlags = [
  nonInteractiveFlag,
  verboseFlag,
  debugFlag,
  quietFlag,
  jsonFlag,
] as const;

// -- Runtime layers --
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
  flag: Flag.boolean("version").pipe(Flag.withDescription("Show version information")),
  run: Effect.fnUntraced(function* (_, context) {
    const formatter = yield* CliOutput.Formatter;
    yield* Console.log(formatter.formatVersion(context.command.name, context.version));
  }),
});

export const cliConfigLayer = CliConfig.layer({ builtIns: [GlobalFlag.Help, versionGlobalFlag] });

export const baseLayer = Layer.mergeAll(runtimeBaseLayer, PlatformLayer, cliConfigLayer);

/**
 * Verbosity-driven logging: the logger set stays binary (consolePretty only at
 * `--debug`), while the minimum log level tracks the full verbosity ladder via
 * `verbosityToLogLevel` (quiet→Warn, normal→Info, verbose→Debug, debug→Trace).
 */
const debugLoggerLayer = Layer.unwrap(
  Effect.map(Verbosity, (v) =>
    Layer.mergeAll(
      Logger.layer(v.isAtLeast("debug") ? [Logger.consolePretty()] : [], {
        mergeWithExisting: false,
      }),
      Layer.succeed(References.MinimumLogLevel, verbosityToLogLevel(v.level)),
    ),
  ),
);

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

const getBuiltInSources = (registryLocation: string): ReadonlyArray<SourceHostConfig> => [
  { name: "default", type: "registry", location: new URL(registryLocation) },
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

const makeCliTelemetryConfig = (envConfig: RuntimeEnvConfig): CliTelemetryConfigService => ({
  mode: resolveTelemetryMode(
    {
      doNotTrack: Option.getOrUndefined(envConfig.doNotTrack),
      telemetry: Option.getOrUndefined(envConfig.telemetry),
    },
    {},
  ),
  client: { name: "cli", version: loadVersion() },
});

const makeWorkspaceProgramLayer = (
  registryLocation: string,
  workspace: Omit<WorkspaceMutationsOptions, "builtInSources">,
) => {
  // -- WorkspaceMutations foundation --
  const wsLayer = coreWorkspaceLayer({
    ...workspace,
    builtInSources: getBuiltInSources(registryLocation),
  });
  const sourceProvidersLayer = Layer.provide(SourceHostProvidersLive, wsLayer);
  const workspaceServiceLayer = Layer.mergeAll(
    wsLayer,
    sourceProvidersLayer,
    CodingAgentRepositoryLive,
  );

  // Extensions: wire workflow actions with core managers.
  // Leaf managers are independent. Packs depend on the other managers.
  const rulesLayer = Layer.provideMerge(
    Layer.mergeAll(InstallRuleCommandWorkflowActionsLive, UninstallRuleCommandWorkflowActionsLive),
    RuleManagerLive,
  );
  const hooksLayer = Layer.provideMerge(
    Layer.mergeAll(InstallHookCommandWorkflowActionsLive, UninstallHookCommandWorkflowActionsLive),
    HookManagerLive,
  );
  const mcpServersLayer = Layer.provideMerge(
    Layer.mergeAll(
      InstallMcpServerCommandWorkflowActionsLive,
      UninstallMcpServerCommandWorkflowActionsLive,
    ),
    McpServerManagerLive,
  );
  const skillsLayer = Layer.provideMerge(
    Layer.mergeAll(
      InstallSkillCommandWorkflowActionsLive,
      UninstallSkillCommandWorkflowActionsLive,
    ),
    SkillManagerLive,
  );
  const subagentsLayer = Layer.provideMerge(
    Layer.mergeAll(
      InstallSubagentCommandWorkflowActionsLive,
      UninstallSubagentCommandWorkflowActionsLive,
    ),
    SubagentManagerLive,
  );
  const knowledgeLayer = Layer.provideMerge(
    Layer.mergeAll(
      InstallKnowledgeCommandWorkflowActionsLive,
      UninstallKnowledgeCommandWorkflowActionsLive,
    ),
    KnowledgeManagerLive,
  );
  const packsLayer = Layer.provideMerge(
    Layer.mergeAll(InstallPackCommandWorkflowActionsLive, UninstallPackCommandWorkflowActionsLive),
    PackManagerLive,
  );
  const coreExtensions = Layer.mergeAll(
    rulesLayer,
    hooksLayer,
    mcpServersLayer,
    skillsLayer,
    subagentsLayer,
    knowledgeLayer,
  );
  const extensionsLayer = Layer.provideMerge(packsLayer, coreExtensions);
  return Layer.provideMerge(extensionsLayer, workspaceServiceLayer);
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

/**
 * Tell the user their lockfile is unreadable before the command's own output.
 *
 * Every command runs with degraded lockfile reads (see `withWorkspace`), so a
 * corrupt `axm-lock.yaml` no longer aborts anything — read-only commands fall
 * back to what `settings.json` declares, and mutating commands recover through
 * reconciliation. This notice is what keeps that from being silent.
 *
 * A *missing* lockfile is ordinary (fresh clone, first install) and is not
 * flagged.
 */
const flagUnreadableLockfile = Effect.gen(function* () {
  const ws = yield* WorkspaceMutations;
  if ((yield* ws.getLockfileState()) !== "invalid") return;
  const renderer = yield* CliRenderer;
  yield* renderer.warn(
    "The workspace lockfile could not be read; reporting declared state from settings.json.",
  );
}).pipe(Effect.catchCause(() => Effect.void));

export const withWorkspace =
  (options: WorkspaceScope | Omit<WorkspaceMutationsOptions, "builtInSources">) =>
  <A, R>(program: Effect.Effect<A, AppError | PromptCancelled, R>) =>
    Effect.gen(function* () {
      const envConfig = yield* readRuntimeEnvConfig;
      const resolved = typeof options === "string" ? { scope: options } : options;
      const wsLayer = makeWorkspaceProgramLayer(envConfig.registryLocation, resolved);
      const renderer = yield* CliRenderer;
      return yield* Effect.scoped(
        renderer
          .withSpinner(`Loading ${resolved.scope} workspace`, () => Layer.build(wsLayer), {
            successMessage: `Loaded ${resolved.scope} workspace`,
          })
          .pipe(
            Effect.flatMap((workspaceContext) =>
              Effect.provide(
                flagUnreadableLockfile.pipe(Effect.andThen(program)),
                workspaceContext,
              ).pipe(withDegradedLockfileReads),
            ),
          ),
      ).pipe(
        Effect.mapError((error) => {
          if (error._tag !== "AppError" || error.suggestions === undefined) return error;
          return new AppError({
            code: error.code,
            title: error.title,
            detail: error.detail,
            ...(error.metadata === undefined ? {} : { metadata: error.metadata }),
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
  <A, R>(program: Effect.Effect<A, AppError | PromptCancelled, R>) =>
    Effect.gen(function* () {
      const config = yield* resolveRuntimeConfig();
      const format = yield* resolveCliFormat;
      const foundationLayer = makeFoundationLayer(format, {
        envVerbose: config.envVerbose,
        envDebug: config.envDebug,
      });
      const interactionLayer = Layer.mergeAll(
        AuthGuardInteractionLive,
        ResolvePlanInteractionLive,
        WorkspaceInitializationInteractionLive,
      );
      const appLayer = Layer.provideMerge(
        debugLoggerLayer,
        Layer.mergeAll(foundationLayer, interactionLayer),
      );

      return yield* withCliErrorHandling(program.pipe(Effect.provide(AuthLayer)), {
        command,
        format,
        telemetryConfig: config.telemetryConfig,
      }).pipe(Effect.provide(appLayer), Effect.scoped);
    }).pipe(Effect.provide(RegistryRuntimeLayer));
