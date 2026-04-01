import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { jsonFlag, debugFlag, verboseFlag, quietFlag } from "../cli-flags/index.js";
import type { OutputFormat } from "./output-mode.js";
import type { AppError } from "../app-error/index.js";
import { renderAppError } from "../app-error/index.js";
import type { PromptCancelled } from "../cli-prompt/prompt-cancelled.js";
import { effectCliExit, isEffectCliExit } from "./effect-cli-exit.js";
import { resolveFormat } from "./resolve-format.js";
import { makeCliTelemetryLayer, type CliTelemetryConfigService } from "./telemetry-layer.js";
import {
  readGlobalFlagProperties,
  reportCliDefect,
  reportCliError,
  trackCliCommand,
  trackCliCommandCompleted,
} from "./telemetry.js";
import { CommandArgv, serializeArgv } from "./command-argv.js";

import { InteractiveRenderer, MachineRenderer, type CliRenderer } from "../cli-renderer/index.js";
import { makeInteractivePrompt, type CliPrompt } from "../cli-prompt/index.js";
import { makeVerbosityLayer, Verbosity, type VerbosityLevel } from "../cli-flags/index.js";
import { isNonInteractive } from "../cli-flags/index.js";
import { makeJsonErrorEnvelopeFromAppError } from "./json-envelope.js";

export type ExpectedCliError = AppError | PromptCancelled;
export type CliRuntimeFoundation = CliRenderer | CliPrompt | Verbosity;

const defaultExitCodeForExpectedError = (error: ExpectedCliError): number =>
  error._tag === "PromptCancelled" ? 0 : 1;

const writeExpectedCliError = (error: ExpectedCliError, format: OutputFormat) =>
  Effect.gen(function* () {
    if (error._tag === "PromptCancelled") {
      return;
    }

    // Try Verbosity service first; fall back to raw flags for backward compatibility
    const verbosityOption = yield* Effect.serviceOption(Verbosity);
    const { verbose, debug } = Option.match(verbosityOption, {
      onNone: () => ({ verbose: false, debug: false }),
      onSome: (v) => ({
        verbose: v.isAtLeast("verbose"),
        debug: v.isAtLeast("debug"),
      }),
    });

    if (format === "text") {
      console.error(renderAppError(error, { verbose, debug }));
      return;
    }

    process.stdout.write(
      JSON.stringify(
        makeJsonErrorEnvelopeFromAppError(error, defaultExitCodeForExpectedError(error)),
        null,
        2,
      ) + "\n",
    );
    console.error(`\u2717 ${error.what}`);
  });

// ---------------------------------------------------------------------------
// Building blocks — composable pieces callers assemble directly
// ---------------------------------------------------------------------------

/**
 * Build the foundation layer: CliRenderer + CliPrompt + Verbosity.
 *
 * The returned layer requires the `nonInteractiveFlag` global flag setting
 * in its context (resolved by the Effect CLI framework at command dispatch).
 */
export const makeFoundationLayer = (
  format: OutputFormat,
  options?: {
    readonly envVerbose?: boolean | undefined;
    readonly envDebug?: boolean | undefined;
    readonly verbosityLevel?: VerbosityLevel | undefined;
  },
) => {
  // Json mode uses machine-readable output.
  const rendererLayer: Layer.Layer<CliRenderer> =
    format !== "text" ? MachineRenderer() : InteractiveRenderer();

  const promptLayer = Layer.unwrap(
    isNonInteractive.pipe(Effect.map((nonInteractive) => makeInteractivePrompt(nonInteractive))),
  );

  // Verbosity: use explicit level if provided, otherwise derive from flags + env vars
  const verbosityLayer = options?.verbosityLevel
    ? makeVerbosityLayer(options.verbosityLevel)
    : Layer.unwrap(
        Effect.gen(function* () {
          const flagDebug = yield* debugFlag;
          const flagVerbose = yield* verboseFlag;
          const flagQuiet = yield* quietFlag;
          const envDebug = options?.envDebug ?? false;
          const envVerbose = options?.envVerbose ?? false;

          const level: VerbosityLevel =
            flagDebug || envDebug
              ? "debug"
              : flagVerbose || envVerbose
                ? "verbose"
                : flagQuiet
                  ? "quiet"
                  : "normal";

          return makeVerbosityLayer(level);
        }),
      );

  return Layer.mergeAll(rendererLayer, promptLayer, verbosityLayer);
};

/**
 * Resolve the output format from the global flag + options.
 */
export const resolveCliFormat = Effect.gen(function* () {
  const explicit = yield* jsonFlag;
  return resolveFormat(explicit);
});

/**
 * Wrap a pre-provided program in CLI error handling + telemetry.
 *
 * The program should already have all its service dependencies satisfied
 * except for TelemetryClient (provided via telemetryLayer internally)
 * and HttpClient (required by the telemetry layer).
 * Callers compose their own layers before passing the program here.
 */
export const withCliErrorHandling = <A, R>(
  program: Effect.Effect<A, ExpectedCliError, R>,
  options: {
    readonly command?: string | undefined;
    readonly format: OutputFormat;
    readonly telemetryConfig: CliTelemetryConfigService;
  },
) => {
  const command = options.command ?? "unknown";
  const telemetryLayer = makeCliTelemetryLayer(command, options.telemetryConfig);

  const enrichedProgram = Effect.gen(function* () {
    // Read optional CommandArgv (won't fail if not provided)
    const argvOption = yield* Effect.serviceOption(CommandArgv);
    const argvProperties = Option.match(argvOption, {
      onNone: () => ({}),
      onSome: (argv) => serializeArgv(argv.value, argv.paramKinds),
    });

    // Read global flag properties for telemetry
    const globalProperties = yield* readGlobalFlagProperties;

    // Merge all properties for command_invoked
    const allProperties: Record<string, string> = {
      ...argvProperties,
      ...globalProperties,
    };

    // Fire command_invoked
    yield* trackCliCommand({ command, properties: allProperties });

    // Execute program with timing
    const startTime = Date.now();

    return yield* program.pipe(
      Effect.tap(() =>
        trackCliCommandCompleted({
          command,
          result: "success",
          durationMs: Date.now() - startTime,
        }),
      ),
      Effect.catch((error: ExpectedCliError) => {
        const durationMs = Date.now() - startTime;
        const exitCode = defaultExitCodeForExpectedError(error);
        const result = error._tag === "PromptCancelled" ? "cancelled" : "error";

        return writeExpectedCliError(error, options.format).pipe(
          Effect.andThen(reportCliError(error, command)),
          Effect.andThen(
            trackCliCommandCompleted({
              command,
              result,
              durationMs,
              ...(error._tag === "AppError" && { errorCode: error.code }),
            }),
          ),
          Effect.andThen(Effect.die(effectCliExit(exitCode))),
        );
      }),
      Effect.catchCause((cause) => {
        const durationMs = Date.now() - startTime;
        const defect = Cause.squash(cause);
        if (isEffectCliExit(defect)) {
          return Effect.failCause(cause);
        }

        return reportCliDefect(cause, command).pipe(
          Effect.andThen(
            trackCliCommandCompleted({
              command,
              result: "defect",
              durationMs,
            }),
          ),
          Effect.andThen(Effect.failCause(cause)),
        );
      }),
    );
  });

  return enrichedProgram.pipe(Effect.provide(telemetryLayer));
};

// ---------------------------------------------------------------------------
// Convenience — for callers that don't need a programLayer
// ---------------------------------------------------------------------------

export interface WithCliRuntimeOptions {
  readonly command?: string | undefined;
  readonly telemetryConfig: CliTelemetryConfigService;
}

export const withCliRuntime = <A, R>(
  program: Effect.Effect<A, ExpectedCliError, R>,
  options: WithCliRuntimeOptions,
) =>
  Effect.gen(function* () {
    const format = yield* resolveCliFormat;
    const foundationLayer = makeFoundationLayer(format);
    const provided = program.pipe(Effect.provide(foundationLayer), Effect.scoped);

    return yield* withCliErrorHandling(provided, {
      command: options.command,
      format,
      telemetryConfig: options.telemetryConfig,
    });
  });
