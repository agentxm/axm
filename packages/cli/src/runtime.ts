import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as Option from "effect/Option";

import type { AppError } from "@axm.sh/core/unstable/app-error";
import type { PromptCancelled } from "@axm.sh/core/unstable/prompt-cancelled";

import {
  CommandArgv,
  type CliTelemetryConfigService,
  makeFoundationLayer,
  resolveCliFormat,
  withCliErrorHandling,
} from "@axm.sh/core/unstable/cli-runtime";
import {
  nonInteractiveFlag,
  outputFormatFlag,
  verboseFlag,
  debugFlag,
} from "@axm.sh/core/unstable/cli-flags";
import { CliEnvConfig, type CliEnvConfigService } from "./config/index.js";
import * as Commands from "./extensions/commands/layers.js";
import * as McpServers from "./extensions/mcp-servers/layers.js";
import * as Packs from "./extensions/packs/layers.js";
import * as Skills from "./extensions/skills/layers.js";
import { SourceHostProvidersLive } from "./sources/index.js";
import { resolveTelemetryMode } from "./telemetry/index.js";
import { type DiagnosticVerbosity, resolveDiagnosticVerbosity } from "./runtime/error-handling.js";
import { baseLayer, CliEnvConfigOrDie } from "./runtime/base-layer.js";
import {
  layer as workspaceLayer,
  type WorkspaceContextOptions,
  type WorkspaceScope,
} from "./workspace/index.js";
import { loadVersion } from "./version.js";
import { getBuiltInSources } from "./workspace/source-metadata.js";

export { verboseFlag, debugFlag };

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
}

const makeDebugLoggerLayer = (diagnosticVerbosity: DiagnosticVerbosity) =>
  Logger.layer(diagnosticVerbosity.debug ? [Logger.consolePretty()] : [], {
    mergeWithExisting: false,
  });

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
  ci: envConfig.ci,
  test: envConfig.vitest === "true",
});

const makeWorkspaceProgramLayer = (
  envConfig: CliEnvConfigService,
  workspace: Omit<WorkspaceContextOptions, "builtInSources">,
) => {
  // -- Workspace foundation --
  const wsLayer = Layer.provide(
    workspaceLayer({
      ...workspace,
      builtInSources: getBuiltInSources(envConfig.registryUrl),
    }),
    CliEnvConfigOrDie,
  );
  const sourceProvidersLayer = Layer.provide(SourceHostProvidersLive, wsLayer);
  const workspaceServiceLayer = Layer.mergeAll(wsLayer, sourceProvidersLayer);

  // -- Extension managers --
  const managerLayer = Layer.mergeAll(
    Layer.provide(Commands.managerLayer, wsLayer),
    Layer.provide(McpServers.managerLayer, wsLayer),
    Layer.provide(Skills.managerLayer, workspaceServiceLayer),
    Layer.provide(Packs.managerLayer, workspaceServiceLayer),
  );

  // -- Workflow actions --
  const supportLayer = Layer.mergeAll(workspaceServiceLayer, managerLayer);
  const workflowActionsLayer = Layer.mergeAll(
    Layer.provide(Commands.workflowActionsLayer, supportLayer),
    Layer.provide(McpServers.workflowActionsLayer, supportLayer),
    Layer.provide(Skills.workflowActionsLayer, supportLayer),
    Layer.provide(Packs.workflowActionsLayer, supportLayer),
  );

  return Layer.mergeAll(supportLayer, workflowActionsLayer);
};

const resolveRuntimeConfig = () =>
  Effect.gen(function* () {
    const envConfig = yield* CliEnvConfig;
    const diagnosticVerbosity = resolveDiagnosticVerbosity(process.argv, {
      AXM_VERBOSE: Option.getOrUndefined(envConfig.verbose),
      AXM_DEBUG: Option.getOrUndefined(envConfig.debug),
    });

    return {
      envConfig,
      ci: envConfig.ci,
      diagnosticVerbosity,
      debugLoggerLayer: makeDebugLoggerLayer(diagnosticVerbosity),
      telemetryConfig: makeCliTelemetryConfig(envConfig),
    } as const;
  });

export const withWorkspace = <A, E, R>(
  options: WorkspaceScope | Omit<WorkspaceContextOptions, "builtInSources">,
  program: Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const envConfig = yield* CliEnvConfig;
    const resolved = typeof options === "string" ? { scope: options } : options;
    const wsLayer = makeWorkspaceProgramLayer(envConfig, resolved);
    return yield* Effect.provide(program, wsLayer);
  });

export const withRuntime = <A, R>(
  program: Effect.Effect<A, AppError | PromptCancelled, R>,
  options?: RuntimeOptions,
) =>
  Effect.gen(function* () {
    const config = yield* resolveRuntimeConfig();
    const format = yield* resolveCliFormat({ isLongRunning: options?.isLongRunning });
    const argvOption = yield* Effect.serviceOption(CommandArgv);
    const foundationLayer = makeFoundationLayer(format, {
      ci: config.ci,
      argv: Option.getOrUndefined(argvOption),
    });
    const appLayer = Layer.provideMerge(config.debugLoggerLayer, foundationLayer);
    const provided = program.pipe(Effect.provide(appLayer), Effect.scoped);

    return yield* withCliErrorHandling(provided, {
      command: options?.command,
      format,
      telemetryConfig: config.telemetryConfig,
      appErrorRenderOptions: config.diagnosticVerbosity,
    });
  });
