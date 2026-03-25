import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { InputLive, InputStructured, type Input } from "../input/index.js";
import {
  CliEnvironment,
  makeCliEnvironmentLayer,
  outputFormatFlag,
  verboseFlag,
  debugFlag,
} from "../cli-flags/index.js";
import type { OutputFormat } from "../output-format.js";
import type { AppError } from "../app-error/index.js";
import { renderAppError } from "../app-error/index.js";
import type { PromptCancelled } from "../prompt-cancelled.js";
import type { Activity } from "../activity/activity.js";
import type { Output } from "../output/output.js";
import { effectCliExit, isEffectCliExit } from "./effect-cli-exit.js";
import { resolveFormat } from "./resolve-format.js";
import { makeCliTelemetryLayer, type CliTelemetryConfigService } from "./telemetry-layer.js";
import { makeUiLayer } from "./ui-layer.js";
import {
  readGlobalFlagProperties,
  reportCliDefect,
  reportCliError,
  trackCliCommand,
  trackCliCommandCompleted,
} from "./telemetry.js";
import { CommandArgv, serializeArgv } from "./command-argv.js";

export type ExpectedCliError = AppError | PromptCancelled;
export type CliRuntimeFoundation = Output | Activity | Input | CliEnvironment;

const defaultExitCodeForExpectedError = (error: ExpectedCliError): number =>
  error._tag === "PromptCancelled" ? 0 : 1;

const writeExpectedCliError = (error: ExpectedCliError, format: OutputFormat) =>
  Effect.gen(function* () {
    if (error._tag === "PromptCancelled") {
      return;
    }

    const verbose = yield* verboseFlag;
    const debug = yield* debugFlag;

    if (format === "text") {
      console.error(renderAppError(error, { verbose, debug }));
      return;
    }

    process.stdout.write(
      JSON.stringify({
        type: "error",
        code: error.code,
        message: error.what,
      }) + "\n",
    );
    console.error(`\u2717 ${error.what}`);
  });

// ---------------------------------------------------------------------------
// Building blocks — composable pieces callers assemble directly
// ---------------------------------------------------------------------------

/**
 * Build the foundation layer: Output + Activity + Input + CliEnvironment.
 *
 * The returned layer requires the `nonInteractiveFlag` global flag setting
 * in its context (resolved by the Effect CLI framework at command dispatch).
 */
export const makeFoundationLayer = (
  format: OutputFormat,
  options?: {
    readonly ci?: boolean | undefined;
    readonly envVerbose?: boolean | undefined;
    readonly envDebug?: boolean | undefined;
  },
) => {
  const cliEnvLayer = makeCliEnvironmentLayer({
    ci: options?.ci,
    envVerbose: options?.envVerbose,
    envDebug: options?.envDebug,
  });
  const uiLayer = makeUiLayer(format);
  const inputLayer = format === "text" ? Layer.provide(InputLive, cliEnvLayer) : InputStructured;
  return Layer.mergeAll(uiLayer, cliEnvLayer, inputLayer);
};

/**
 * Resolve the output format from the global flag + options.
 */
export const resolveCliFormat = (options?: { readonly isLongRunning?: boolean | undefined }) =>
  Effect.gen(function* () {
    const explicit = yield* outputFormatFlag;
    return resolveFormat(explicit, options);
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
  readonly isLongRunning?: boolean | undefined;
  readonly ci?: boolean | undefined;
  readonly telemetryConfig: CliTelemetryConfigService;
}

export const withCliRuntime = <A, R>(
  program: Effect.Effect<A, ExpectedCliError, R>,
  options: WithCliRuntimeOptions,
) =>
  Effect.gen(function* () {
    const format = yield* resolveCliFormat({ isLongRunning: options.isLongRunning });
    const foundationLayer = makeFoundationLayer(format, { ci: options.ci });
    const provided = program.pipe(Effect.provide(foundationLayer), Effect.scoped);

    return yield* withCliErrorHandling(provided, {
      command: options.command,
      format,
      telemetryConfig: options.telemetryConfig,
    });
  });
