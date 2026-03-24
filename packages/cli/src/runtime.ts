import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as Option from "effect/Option";
import { Flag, GlobalFlag } from "effect/unstable/cli";

import type { AppError } from "./app-error/index.js";
import type { PromptCancelled } from "./prompt-cancelled.js";

import { type CliTelemetryConfigService, withCliRuntime } from "@axm.sh/core/unstable/cli-runtime";
import { nonInteractiveFlag, outputFormatFlag } from "@axm.sh/core/unstable/cli-flags";
import { InstallCommandCommandWorkflowActionsLive } from "./cli-commands/commands/install/command-actions.js";
import { UninstallCommandCommandWorkflowActionsLive } from "./cli-commands/commands/uninstall/command-actions.js";
import { InstallMcpServerCommandWorkflowActionsLive } from "./cli-commands/mcp-servers/install/command-actions.js";
import { UninstallMcpServerCommandWorkflowActionsLive } from "./cli-commands/mcp-servers/uninstall/command-actions.js";
import { InstallPackCommandWorkflowActionsLive } from "./cli-commands/packs/install/command-actions.js";
import { UninstallPackCommandWorkflowActionsLive } from "./cli-commands/packs/uninstall/command-actions.js";
import { InstallSkillCommandWorkflowActionsLive } from "./cli-commands/skills/install/command-actions.js";
import { UninstallSkillCommandWorkflowActionsLive } from "./cli-commands/skills/uninstall/command-actions.js";
import { CliEnvConfig, type CliEnvConfigService } from "./config/index.js";
import { CommandManagerLive } from "./extensions/commands/manager.js";
import { McpServerManagerLive } from "./extensions/mcp-servers/manager.js";
import { PackManagerLive } from "./extensions/packs/manager.js";
import { SkillManagerLive } from "./extensions/skills/manager.js";
import { SourceHostProvidersLive } from "./sources/index.js";
import { resolveTelemetryMode } from "./telemetry/index.js";
import { type DiagnosticVerbosity, resolveDiagnosticVerbosity } from "./runtime/error-handling.js";
import { baseLayer, CliEnvConfigOrDie } from "./runtime/base-layer.js";
import { layer as workspaceLayer, type WorkspaceContextOptions } from "./workspace/index.js";
import { loadVersion } from "./version.js";
import { getBuiltInSources } from "./workspace/source-metadata.js";

export const verboseFlag = GlobalFlag.setting("axm-verbose")({
  flag: Flag.boolean("verbose").pipe(
    Flag.withAlias("v"),
    Flag.withDescription("Show additional diagnostic details for errors"),
  ),
});

export const debugFlag = GlobalFlag.setting("axm-debug")({
  flag: Flag.boolean("debug").pipe(
    Flag.withDescription("Show full debug details for errors (implies --verbose)"),
  ),
});

export const axmGlobalFlags = [
  nonInteractiveFlag,
  verboseFlag,
  debugFlag,
  outputFormatFlag,
] as const;

export { baseLayer };

interface RuntimeOptions {
  readonly command?: string;
  readonly isLongRunning?: boolean;
  readonly workspace?: Omit<WorkspaceContextOptions, "builtInSources">;
  readonly flags?: {
    readonly yes?: boolean;
    readonly force?: boolean;
    readonly preview?: boolean;
  };
}

const makeDebugLoggerLayer = (diagnosticVerbosity: DiagnosticVerbosity) =>
  diagnosticVerbosity.debug
    ? Logger.layer([Logger.consolePretty()], { mergeWithExisting: false })
    : Layer.empty;

const makeCliTelemetryConfig = (envConfig: CliEnvConfigService): CliTelemetryConfigService => ({
  mode: resolveTelemetryMode(
    {
      doNotTrack: Option.getOrUndefined(envConfig.doNotTrack),
      axmTelemetry: Option.getOrUndefined(envConfig.telemetry),
    },
    {},
  ),
  client: { name: "cli", version: loadVersion() },
  runtime: { name: "bun", version: process.versions["bun"] ?? "unknown" },
  ci: envConfig.ci === "true",
  test: envConfig.vitest === "true",
});

const makeWorkspaceProgramLayer = (
  envConfig: CliEnvConfigService,
  workspace: Omit<WorkspaceContextOptions, "builtInSources">,
  debugLoggerLayer: Layer.Layer<never>,
) => {
  const wsLayer = Layer.provide(
    workspaceLayer({
      ...workspace,
      builtInSources: getBuiltInSources(envConfig.registryUrl),
    }),
    CliEnvConfigOrDie,
  );
  const sourceProvidersLayer = Layer.provide(SourceHostProvidersLive, wsLayer);
  const workspaceServiceLayer = Layer.mergeAll(wsLayer, sourceProvidersLayer);
  const managerLayer = Layer.mergeAll(
    Layer.provide(CommandManagerLive, wsLayer),
    Layer.provide(McpServerManagerLive, wsLayer),
    Layer.provide(SkillManagerLive, workspaceServiceLayer),
    Layer.provide(PackManagerLive, workspaceServiceLayer),
  );
  const workspaceCommandSupportLayer = Layer.mergeAll(workspaceServiceLayer, managerLayer);
  const workflowActionsLayer = Layer.mergeAll(
    Layer.provide(InstallSkillCommandWorkflowActionsLive, workspaceCommandSupportLayer),
    Layer.provide(UninstallSkillCommandWorkflowActionsLive, workspaceCommandSupportLayer),
    Layer.provide(InstallCommandCommandWorkflowActionsLive, workspaceCommandSupportLayer),
    Layer.provide(UninstallCommandCommandWorkflowActionsLive, workspaceCommandSupportLayer),
    Layer.provide(InstallPackCommandWorkflowActionsLive, workspaceCommandSupportLayer),
    Layer.provide(UninstallPackCommandWorkflowActionsLive, workspaceCommandSupportLayer),
    Layer.provide(InstallMcpServerCommandWorkflowActionsLive, workspaceCommandSupportLayer),
    Layer.provide(UninstallMcpServerCommandWorkflowActionsLive, workspaceCommandSupportLayer),
  );

  return Layer.mergeAll(debugLoggerLayer, workspaceCommandSupportLayer, workflowActionsLayer);
};

const resolveRuntime = (options?: RuntimeOptions) =>
  Effect.gen(function* () {
    const envConfig = yield* CliEnvConfig;
    const diagnosticVerbosity = resolveDiagnosticVerbosity(process.argv, {
      AXM_VERBOSE: Option.getOrUndefined(envConfig.verbose),
      AXM_DEBUG: Option.getOrUndefined(envConfig.debug),
    });
    const debugLoggerLayer = makeDebugLoggerLayer(diagnosticVerbosity);
    const programLayer =
      options?.workspace === undefined
        ? debugLoggerLayer
        : makeWorkspaceProgramLayer(envConfig, options.workspace, debugLoggerLayer);

    return {
      ci: envConfig.ci === "true",
      diagnosticVerbosity,
      telemetryConfig: makeCliTelemetryConfig(envConfig),
      programLayer,
    } as const;
  });

export const withRuntime = <A, R>(
  program: Effect.Effect<A, AppError | PromptCancelled, R>,
  options?: RuntimeOptions,
): Effect.Effect<A, unknown, never> =>
  Effect.gen(function* () {
    const resolvedRuntime = yield* resolveRuntime(options);

    return yield* withCliRuntime(program, {
      command: options?.command,
      isLongRunning: options?.isLongRunning,
      ci: resolvedRuntime.ci,
      flags: options?.flags,
      telemetryConfig: resolvedRuntime.telemetryConfig,
      appErrorRenderOptions: resolvedRuntime.diagnosticVerbosity,
      programLayer: resolvedRuntime.programLayer,
    });
  }).pipe(Effect.provide(baseLayer)) as Effect.Effect<A, unknown, never>;
