/**
 * Command Runtime — shared infrastructure for CLI command files.
 *
 * Extracted from cli.ts to avoid circular imports: command files import from
 * here, and cli.ts imports command files. Both directions are acyclic.
 *
 * Provides:
 * - Global flag definitions (yielded by command handlers)
 * - Base layer (services provided once at run() boundary)
 * - withCommandRuntime() (per-command service provision + error handling)
 */

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as Option from "effect/Option";
import { Command, Flag, GlobalFlag } from "effect/unstable/cli";

import type { AppError } from "./app-error/index.js";
import type { OutputFormat } from "./output.js";
import type { PromptCancelled } from "./prompt-cancelled.js";

import {
  type EffectCliExit,
  effectCliExit,
  isEffectCliExit,
  makeUiLayer,
} from "@axm.sh/core/unstable/cli-runtime";
import { nonInteractiveFlag, outputFormatFlag } from "@axm.sh/core/unstable/cli-flags";
import { AuthClientLive } from "./auth/auth-client.js";
import { AuthMiddlewareLive, RegistryUrl } from "./auth/auth-middleware.js";
import { CredentialStoreLive } from "./auth/credential-store.js";
import { makeCliFlagsLayer } from "./cli-flags/index.js";
import { InputLive, InputStructured } from "./input/index.js";
import { CliEnvConfig, CliEnvConfigLive } from "./config/index.js";
import { SourceHostProvidersLive } from "./sources/index.js";
import { TelemetryClient, TelemetryClientLive, resolveTelemetryMode } from "./telemetry/index.js";
import { classifyError, resolveDiagnosticVerbosity } from "./runtime/error-handling.js";
import { layer as workspaceLayer, type WorkspaceContextOptions } from "./workspace/index.js";
import { loadVersion } from "./version.js";
import { getBuiltInSources } from "./workspace/source-metadata.js";

// Re-export for consumers that import from command-runtime
export { type EffectCliExit, effectCliExit, isEffectCliExit, outputFormatFlag };

// ---------------------------------------------------------------------------
// Global flags
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Help display — parent commands show help via the root command ref
//
// cliCommandRef is populated by cli.ts after the root command is built.
// Parent commands call showHelpFor() lazily so the ref is always available
// by the time any command handler runs.
// ---------------------------------------------------------------------------

type AnyCommand = Command.Command.Any;

export const cliCommandRef: { current: AnyCommand | undefined } = { current: undefined };

export const showHelpFor = (commandPath: ReadonlyArray<string>) =>
  Effect.suspend(() => {
    if (cliCommandRef.current === undefined) {
      return Effect.die(new Error("CLI command not initialized"));
    }
    return GlobalFlag.Help.run(true, {
      command: cliCommandRef.current,
      commandPath,
      version: loadVersion(),
    });
  });

// ---------------------------------------------------------------------------
// Layer composition — base services provided once at run() boundary
// ---------------------------------------------------------------------------

const CliEnvConfigOrDie: Layer.Layer<CliEnvConfig> = Layer.orDie(CliEnvConfigLive);

const RegistryUrlLayer = Layer.effect(
  RegistryUrl,
  Effect.map(CliEnvConfig.asEffect(), (cfg) => cfg.registryUrl),
);

const PlatformLayer = Layer.mergeAll(NodeServices.layer, FetchHttpClient.layer);

const AuthServicesLayer = Layer.provide(
  Layer.mergeAll(CredentialStoreLive, AuthClientLive, RegistryUrlLayer),
  Layer.mergeAll(PlatformLayer, CliEnvConfigOrDie),
);

const AuthMiddlewareWrappedLayer = Layer.provide(
  AuthMiddlewareLive,
  Layer.mergeAll(AuthServicesLayer, PlatformLayer, CliEnvConfigOrDie),
);

const AuthLayer = Layer.mergeAll(NodeServices.layer, AuthServicesLayer, AuthMiddlewareWrappedLayer);

export const baseLayer = Layer.mergeAll(
  AuthLayer,
  CliEnvConfigOrDie,
  Logger.layer([], { mergeWithExisting: false }),
);

// ---------------------------------------------------------------------------
// Unified command runtime — resolves global flags and provides per-command
// services (CliFlags, Output/Activity/Input, Telemetry) within the Effect context.
//
// Optionally provides Workspace + SourceHostProviders when workspace options
// are passed (task 2.4 — workspace as scoped layer).
// ---------------------------------------------------------------------------

export interface CommandRuntimeOptions {
  readonly command?: string;
  readonly workspace?: Omit<WorkspaceContextOptions, "builtInSources">;
  readonly flags?: {
    readonly yes?: boolean;
    readonly force?: boolean;
    readonly preview?: boolean;
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProgram = Effect.Effect<void, AppError | PromptCancelled, any>;

export const withCommandRuntime = (
  program: AnyProgram,
  options?: CommandRuntimeOptions,
): Effect.Effect<void, unknown, unknown> =>
  Effect.gen(function* () {
    const cliFlagsLayer = makeCliFlagsLayer(options?.flags);
    const envConfig = yield* CliEnvConfig;

    // Resolve telemetry
    const mode = resolveTelemetryMode(
      {
        doNotTrack: Option.getOrUndefined(envConfig.doNotTrack),
        axmTelemetry: Option.getOrUndefined(envConfig.telemetry),
      },
      {},
    );
    const command = options?.command ?? "unknown";
    const telemetryLayer = Layer.provide(
      TelemetryClientLive(mode, command),
      Layer.mergeAll(FetchHttpClient.layer, CliEnvConfigOrDie),
    );

    // Resolve diagnostic verbosity
    const diagnosticVerbosity = resolveDiagnosticVerbosity(process.argv, {
      AXM_VERBOSE: Option.getOrUndefined(envConfig.verbose),
      AXM_DEBUG: Option.getOrUndefined(envConfig.debug),
    });
    const debugLoggerLayer = diagnosticVerbosity.debug
      ? Logger.layer([Logger.consolePretty()], { mergeWithExisting: false })
      : Layer.empty;

    // Resolve output mode to select the appropriate UI layers.
    // Only use structured layers when the user explicitly requests it via
    // --output-format json/stream-json. UI services default to interactive
    // (live) unless overridden.
    const explicitFormat = yield* outputFormatFlag;
    const isStructured = Option.isSome(explicitFormat) && explicitFormat.value !== "text";

    // Assertion needed: TS doesn't narrow Option.value via boolean check above
    const structuredMode = isStructured
      ? (explicitFormat.value as Exclude<OutputFormat, "text">)
      : undefined;

    // Output/Activity from core, Input added separately (depends on CliFlags)
    const baseUiLayer = makeUiLayer(structuredMode ?? "text");
    const inputLayer = structuredMode
      ? InputStructured
      : Layer.provide(InputLive, cliFlagsLayer);
    const uiLayer = Layer.mergeAll(baseUiLayer, inputLayer);

    // Per-command layer: CliFlags + Output/Activity/Input + Telemetry + debug logging
    const commandLayer = Layer.mergeAll(cliFlagsLayer, uiLayer, telemetryLayer, debugLoggerLayer);

    // Build the provided program — optionally with Workspace (task 2.4)
    const catchErrors = (effect: AnyProgram) =>
      effect.pipe(
        Effect.catch((error: AppError | PromptCancelled) => {
          const result = classifyError(error, diagnosticVerbosity);
          const writeError =
            result.exitCode === 0
              ? Effect.void
              : Effect.sync(() => {
                  console.error(result.message);
                });

          // Provide telemetryLayer directly so it's available even when the
          // workspace layer (or any other inner layer) fails during construction.
          const report =
            error._tag === "AppError"
              ? Effect.gen(function* () {
                  const tc = yield* TelemetryClient;
                  yield* tc
                    .reportError({
                      name: error.code,
                      message: error.what,
                      details: error.details,
                      ...(Option.isSome(error.howToFix) && { howToFix: error.howToFix.value }),
                      level: "error" as const,
                      handled: true,
                      command,
                    })
                    .pipe(Effect.catchCause(() => Effect.void));
                }).pipe(
                  Effect.provide(telemetryLayer),
                  Effect.catchCause(() => Effect.void),
                )
              : Effect.void;

          return writeError.pipe(
            Effect.andThen(report),
            Effect.flatMap(() => Effect.die(effectCliExit(result.exitCode))),
          );
        }),
      );

    if (options?.workspace) {
      const wsLayer = Layer.provide(
        workspaceLayer({
          ...options.workspace,
          builtInSources: getBuiltInSources(envConfig.registryUrl),
        }),
        Layer.provideMerge(cliFlagsLayer, CliEnvConfigOrDie),
      );
      const sourceProvidersLayer = Layer.provide(SourceHostProvidersLive, wsLayer);
      // commandLayer provides Output/Activity/Input services
      // that wsLayer may depend on, so use provideMerge to satisfy dependencies in order.
      const fullLayer = Layer.provideMerge(
        Layer.mergeAll(wsLayer, sourceProvidersLayer),
        commandLayer,
      );
      yield* catchErrors(program.pipe(Effect.provide(fullLayer), Effect.scoped));
    } else {
      yield* catchErrors(program.pipe(Effect.provide(commandLayer)));
    }
  });
