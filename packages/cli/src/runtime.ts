import * as NodeServices from "@effect/platform-node/NodeServices";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as Option from "effect/Option";
import { pathToFileURL } from "node:url";

import type { AppError } from "@agentxm/client-core/unstable/app-error";
import type { PromptCancelled } from "@agentxm/client-core/unstable/prompt-cancelled";

import {
  type CliTelemetryConfigService,
  makeFoundationLayer,
  resolveCliFormat,
  withCliErrorHandling,
} from "@agentxm/client-core/unstable/cli-runtime";
import {
  Verbosity,
  nonInteractiveFlag,
  jsonFlag,
  verboseFlag,
  debugFlag,
  quietFlag,
} from "@agentxm/client-core/unstable/cli-flags";
import { SkillManagerLive } from "@agentxm/client-core/unstable/skills";
import { PackManagerLive } from "@agentxm/client-core/unstable/packs";
import { CommandManagerLive } from "@agentxm/client-core/unstable/commands";
import { FilesManagerLive } from "@agentxm/client-core/unstable/files";
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
  RegistryUrl,
} from "@agentxm/client-core/unstable/auth";
import { InstallCommandCommandWorkflowActionsLive } from "./root/commands/install/command-actions.js";
import { UninstallCommandCommandWorkflowActionsLive } from "./root/commands/uninstall/command-actions.js";
import { InstallFilesCommandWorkflowActionsLive } from "./root/files/install/command-actions.js";
import { UninstallFilesCommandWorkflowActionsLive } from "./root/files/uninstall/command-actions.js";
import { InstallHookCommandWorkflowActionsLive } from "./root/hooks/install/command-actions.js";
import { UninstallHookCommandWorkflowActionsLive } from "./root/hooks/uninstall/command-actions.js";
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
  WorkspaceInitializationInteractionLive,
} from "@agentxm/client-core/unstable/workspace";
import type { SourceHostConfig } from "@agentxm/client-core/unstable/settings";
import { loadVersion } from "./version.js";

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

const PlatformLayer = Layer.mergeAll(NodeServices.layer, FetchHttpClient.layer);
const RegistryRuntimeLayer = Layer.mergeAll(PlatformLayer, RegistryUrlLayer);

const AuthServicesLayer = Layer.provideMerge(
  Layer.mergeAll(CredentialStoreLive, AuthClientLive),
  RegistryRuntimeLayer,
);

const AuthMiddlewareWrappedLayer = Layer.provide(
  AuthMiddlewareLive,
  Layer.mergeAll(AuthServicesLayer, PlatformLayer),
);

export const AuthLayer = Layer.mergeAll(AuthServicesLayer, AuthMiddlewareWrappedLayer);

export const runtimeBaseLayer = Layer.mergeAll(
  NodeServices.layer,
  RegistryUrlLayer,
  AuthLoginInteractionLive,
  Logger.layer([], { mergeWithExisting: false }),
);

export const baseLayer = Layer.mergeAll(runtimeBaseLayer, PlatformLayer);

const debugLoggerLayer = Layer.unwrap(
  Effect.map(Verbosity, (v) =>
    Logger.layer(v.isAtLeast("debug") ? [Logger.consolePretty()] : [], {
      mergeWithExisting: false,
    }),
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
  // Commands, McpServers, Skills are independent. Packs depends on the other managers.
  const commandsLayer = Layer.provideMerge(
    Layer.mergeAll(
      InstallCommandCommandWorkflowActionsLive,
      UninstallCommandCommandWorkflowActionsLive,
    ),
    CommandManagerLive,
  );
  const filesLayer = Layer.provideMerge(
    Layer.mergeAll(
      InstallFilesCommandWorkflowActionsLive,
      UninstallFilesCommandWorkflowActionsLive,
    ),
    FilesManagerLive,
  );
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
  const packsLayer = Layer.provideMerge(
    Layer.mergeAll(InstallPackCommandWorkflowActionsLive, UninstallPackCommandWorkflowActionsLive),
    PackManagerLive,
  );
  const coreExtensions = Layer.mergeAll(
    commandsLayer,
    filesLayer,
    rulesLayer,
    hooksLayer,
    mcpServersLayer,
    skillsLayer,
    subagentsLayer,
    KnowledgeManagerLive,
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

export const withWorkspace =
  (options: WorkspaceScope | Omit<WorkspaceMutationsOptions, "builtInSources">) =>
  <A, E, R>(program: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const envConfig = yield* readRuntimeEnvConfig;
      const resolved = typeof options === "string" ? { scope: options } : options;
      const wsLayer = makeWorkspaceProgramLayer(envConfig.registryLocation, resolved);
      return yield* Effect.provide(program, wsLayer);
    });

export const withAuthRuntime =
  (command?: string) =>
  <A, R>(program: Effect.Effect<A, AppError | PromptCancelled, R>) =>
    program.pipe(Effect.provide(AuthLayer), withRuntime(command));

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

      return yield* withCliErrorHandling(program, {
        command,
        format,
        telemetryConfig: config.telemetryConfig,
      }).pipe(Effect.provide(appLayer), Effect.scoped);
    }).pipe(Effect.provide(RegistryRuntimeLayer));
