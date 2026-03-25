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
  CliEnvironment,
  nonInteractiveFlag,
  outputFormatFlag,
  verboseFlag,
  debugFlag,
} from "@axm.sh/core/unstable/cli-flags";
import * as Commands from "./extensions/commands/layers.js";
import * as McpServers from "./extensions/mcp-servers/layers.js";
import * as Packs from "./extensions/packs/layers.js";
import * as Skills from "./extensions/skills/layers.js";
import { SourceHostProvidersLive } from "./sources/index.js";
import { resolveTelemetryMode } from "./telemetry/index.js";
import { baseLayer } from "./runtime/base-layer.js";
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

const debugLoggerLayer = Layer.unwrap(
  Effect.map(CliEnvironment.asEffect(), (flags) =>
    Logger.layer(flags.debug ? [Logger.consolePretty()] : [], {
      mergeWithExisting: false,
    }),
  ),
);

interface RuntimeEnvConfig {
  readonly registryUrl: string;
  readonly doNotTrack: Option.Option<string>;
  readonly telemetry: Option.Option<string>;
  readonly ci: boolean;
  readonly vitest: string;
  readonly verbose: Option.Option<string>;
  readonly debug: Option.Option<string>;
}

const readRuntimeEnvConfig = Effect.sync(() => ({
  registryUrl: process.env["AXM_REGISTRY_URL"] ?? "https://registry.agentxm.ai",
  doNotTrack: Option.fromUndefinedOr(process.env["DO_NOT_TRACK"]),
  telemetry: Option.fromUndefinedOr(process.env["AXM_TELEMETRY"]),
  ci: process.env["CI"] === "true",
  vitest: process.env["VITEST"] ?? "false",
  verbose: Option.fromUndefinedOr(process.env["AXM_VERBOSE"]),
  debug: Option.fromUndefinedOr(process.env["AXM_DEBUG"]),
}));

const makeCliTelemetryConfig = (envConfig: RuntimeEnvConfig): CliTelemetryConfigService => ({
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
  registryUrl: string,
  workspace: Omit<WorkspaceContextOptions, "builtInSources">,
) => {
  // -- Workspace foundation --
  const wsLayer = workspaceLayer({
    ...workspace,
    builtInSources: getBuiltInSources(registryUrl),
  });
  const sourceProvidersLayer = Layer.provide(SourceHostProvidersLive, wsLayer);
  const workspaceServiceLayer = Layer.mergeAll(wsLayer, sourceProvidersLayer);

  // -- Extensions (per-feature self-wired layers) --
  // Commands, McpServers, Skills are self-contained.
  // Packs depends on the other features' managers, so it's provided separately.
  const coreExtensions = Layer.mergeAll(Commands.layer, McpServers.layer, Skills.layer);
  const extensionsLayer = Layer.provideMerge(Packs.layer, coreExtensions);

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
      ci: envConfig.ci,
      envVerbose: envToBool(envConfig.verbose),
      envDebug: envToBool(envConfig.debug),
      telemetryConfig: makeCliTelemetryConfig(envConfig),
    } as const;
  });

export const withWorkspace = <A, E, R>(
  options: WorkspaceScope | Omit<WorkspaceContextOptions, "builtInSources">,
  program: Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const registryUrl = process.env["AXM_REGISTRY_URL"] ?? "https://registry.agentxm.ai";
    const resolved = typeof options === "string" ? { scope: options } : options;
    const wsLayer = makeWorkspaceProgramLayer(registryUrl, resolved);
    return yield* Effect.provide(program, wsLayer);
  });

export const withRuntime = <A, R>(
  program: Effect.Effect<A, AppError | PromptCancelled, R>,
  options?: RuntimeOptions,
) =>
  Effect.gen(function* () {
    const config = yield* resolveRuntimeConfig();
    const format = yield* resolveCliFormat({ isLongRunning: options?.isLongRunning });
    const foundationLayer = makeFoundationLayer(format, {
      ci: config.ci,
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
