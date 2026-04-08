import * as NodeServices from "@effect/platform-node/NodeServices";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as Option from "effect/Option";

import type { AppError } from "@axm.sh/core/unstable/app-error";
import type { PromptCancelled } from "@axm.sh/core/unstable/prompt-cancelled";

import {
  type CliTelemetryConfigService,
  makeFoundationLayer,
  resolveCliFormat,
  withCliErrorHandling,
} from "@axm.sh/core/unstable/cli-runtime";
import {
  Verbosity,
  nonInteractiveFlag,
  jsonFlag,
  verboseFlag,
  debugFlag,
  quietFlag,
} from "@axm.sh/core/unstable/cli-flags";
import { SkillManagerLive } from "@axm.sh/core/unstable/skills";
import { ExtensionPackManagerLive } from "@axm.sh/core/unstable/packs";
import { CommandManagerLive } from "@axm.sh/core/unstable/commands";
import { McpServerManagerLive } from "@axm.sh/core/unstable/mcp-servers";
import { SubagentManagerLive } from "@axm.sh/core/unstable/subagents";
import { SourceHostProvidersLive } from "@axm.sh/core/unstable/source-resolution";
import { CodingAgentRepositoryLive } from "@axm.sh/core/unstable/agents";
import {
  AuthClientLive,
  AuthLoginInteractionLive,
  AuthMiddlewareLive,
  CredentialStoreLive,
  RegistryUrl,
} from "@axm.sh/core/unstable/auth";
import { InstallCommandCommandWorkflowActionsLive } from "./root/commands/install/command-actions.js";
import { UninstallCommandCommandWorkflowActionsLive } from "./root/commands/uninstall/command-actions.js";
import { InstallMcpServerCommandWorkflowActionsLive } from "./root/mcp-servers/install/command-actions.js";
import { UninstallMcpServerCommandWorkflowActionsLive } from "./root/mcp-servers/uninstall/command-actions.js";
import { InstallPackCommandWorkflowActionsLive } from "./root/packs/install/command-actions.js";
import { UninstallPackCommandWorkflowActionsLive } from "./root/packs/uninstall/command-actions.js";
import { InstallSkillCommandWorkflowActionsLive } from "./root/skills/install/command-actions.js";
import { UninstallSkillCommandWorkflowActionsLive } from "./root/skills/uninstall/command-actions.js";
import { InstallSubagentCommandWorkflowActionsLive } from "./root/subagents/install/command-actions.js";
import { UninstallSubagentCommandWorkflowActionsLive } from "./root/subagents/uninstall/command-actions.js";
import { resolveTelemetryMode } from "@axm.sh/core/unstable/telemetry";
import type { WorkspaceContextOptions, WorkspaceScope } from "@axm.sh/core/unstable/workspace";
import { getBuiltInSources, layer as coreWorkspaceLayer } from "@axm.sh/core/unstable/workspace";
import { loadVersion } from "./version.js";
import { makeAppError } from "@axm.sh/core/unstable/app-error";

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
    Effect.gen(function* () {
      return yield* Config.string("AXM_REGISTRY_URL").pipe(
        Config.withDefault("https://registry.agentxm.ai"),
      );
    }),
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

const AuthLayer = Layer.mergeAll(AuthServicesLayer, AuthMiddlewareWrappedLayer);

export const runtimeBaseLayer = Layer.mergeAll(
  NodeServices.layer,
  RegistryUrlLayer,
  AuthLoginInteractionLive,
  Logger.layer([], { mergeWithExisting: false }),
);

export const baseLayer = Layer.mergeAll(runtimeBaseLayer, PlatformLayer);

export interface RuntimeCapabilities {
  readonly json: boolean;
}

interface RuntimeOptions {
  readonly command?: string;
  readonly capabilities?: RuntimeCapabilities;
}

const debugLoggerLayer = Layer.unwrap(
  Effect.map(Verbosity.asEffect(), (v) =>
    Logger.layer(v.isAtLeast("debug") ? [Logger.consolePretty()] : [], {
      mergeWithExisting: false,
    }),
  ),
);

interface RuntimeEnvConfig {
  readonly registryUrl: string;
  readonly doNotTrack: Option.Option<string>;
  readonly telemetry: Option.Option<string>;
  readonly verbose: Option.Option<string>;
  readonly debug: Option.Option<string>;
}

const readRuntimeEnvConfig = Effect.gen(function* () {
  const registryUrl = yield* RegistryUrl;
  return {
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
  registryUrl: string,
  workspace: Omit<WorkspaceContextOptions, "builtInSources">,
) => {
  // -- Workspace foundation --
  const wsLayer = coreWorkspaceLayer({
    ...workspace,
    builtInSources: getBuiltInSources(registryUrl),
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
    ExtensionPackManagerLive,
  );
  const coreExtensions = Layer.mergeAll(
    commandsLayer,
    mcpServersLayer,
    skillsLayer,
    subagentsLayer,
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
  (options: WorkspaceScope | Omit<WorkspaceContextOptions, "builtInSources">) =>
  <A, E, R>(program: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const registryUrl = yield* RegistryUrl;
      const resolved = typeof options === "string" ? { scope: options } : options;
      const wsLayer = makeWorkspaceProgramLayer(registryUrl, resolved);
      return yield* Effect.provide(program, wsLayer);
    });

export const withRegistryRuntime =
  (options?: RuntimeOptions) =>
  <A, R>(program: Effect.Effect<A, AppError | PromptCancelled, R>) =>
    program.pipe(Effect.provide(RegistryRuntimeLayer), withRuntime(options));

export const withAuthRuntime =
  (options?: RuntimeOptions) =>
  <A, R>(program: Effect.Effect<A, AppError | PromptCancelled, R>) =>
    program.pipe(Effect.provide(AuthLayer), withRuntime(options));

export const withRuntime =
  (options?: RuntimeOptions) =>
  <A, R>(program: Effect.Effect<A, AppError | PromptCancelled, R>) =>
    Effect.gen(function* () {
      const config = yield* resolveRuntimeConfig();
      const explicitJson = yield* jsonFlag;
      const jsonRequested = Option.getOrElse(explicitJson, () => false);

      if (jsonRequested && options?.capabilities?.json !== true) {
        return yield* makeAppError({
          code: "JSON_OUTPUT_UNSUPPORTED",
          what: "This command does not support --json output",
          howToFix: "Use a command with a published JSON schema or omit --json.",
        });
      }

      const format = yield* resolveCliFormat;
      const foundationLayer = makeFoundationLayer(format, {
        envVerbose: config.envVerbose,
        envDebug: config.envDebug,
      });
      const appLayer = Layer.provideMerge(debugLoggerLayer, foundationLayer);
      const provided = program.pipe(Effect.provide(appLayer), Effect.scoped);

      return yield* withCliErrorHandling(provided, {
        command: options?.command,
        format,
        telemetryConfig: config.telemetryConfig,
      });
    });
