import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { jsonFlag, debugFlag, verboseFlag, quietFlag } from "../cli-flags/index.js";
import type { OutputFormat } from "./output-mode.js";
import { makeErrorEvent } from "./output-mode.js";
import type { AppError } from "../app-error/index.js";
import { ExitCode, exitCodeFor, redactSensitiveText } from "../app-error/index.js";
import type { PromptCancelled } from "../cli-prompt/prompt-cancelled.js";
import { renderAppErrorChannels } from "./handle-error.js";
import { effectCliExit, isEffectCliExit } from "./effect-cli-exit.js";
import { resolveFormat } from "./resolve-format.js";
import { makeCliTelemetryLayer, type CliTelemetryConfigService } from "./telemetry-layer.js";
import {
  readGlobalFlagProperties,
  reportCliDefect,
  reportCliError,
  trackCliCommand,
  trackCliCommandCompleted,
  getCommandSemanticProperties,
  CommandSemanticPropertiesLive,
} from "./telemetry.js";
import { CommandArgv, serializeArgv } from "./command-argv.js";
import type { TelemetryProperties } from "../telemetry/index.js";

import {
  InteractiveRenderer,
  MachineRenderer,
  resolveCliOutputPolicy,
  type CliRenderer,
} from "../cli-renderer/index.js";
import { makeVerbosityLayer, Verbosity, type VerbosityLevel } from "../cli-flags/index.js";
import { makeJsonErrorEnvelope } from "./json-envelope.js";

const writeStderr = (message: string): void => {
  process.stderr.write(message.endsWith("\n") ? message : `${message}\n`);
};

const defectMessage = (cause: Cause.Cause<unknown>): string => {
  const squashed = Cause.squash(cause);
  return redactSensitiveText(squashed instanceof Error ? squashed.message : String(squashed));
};

/**
 * Emit a defect (unhandled panic) to the appropriate channel.
 *
 * - text: human-readable message on stderr.
 * - json: NDJSON `error` event on stderr + structured envelope on stdout.
 *
 * Exported for tests; production callers route through `withCliErrorHandling`.
 */
export const writeDefect = (cause: Cause.Cause<unknown>, format: OutputFormat): void => {
  const message = defectMessage(cause);

  if (format === "text") {
    writeStderr(`✖  ${message}`);
    return;
  }

  writeStderr(JSON.stringify(makeErrorEvent("internal", message)));
  process.stdout.write(
    JSON.stringify(
      makeJsonErrorEnvelope({
        code: "internal",
        title: "Internal Error",
        detail: message,
      }),
      null,
      2,
    ) + "\n",
  );
};

export type ExpectedCliError = AppError | PromptCancelled;
export type CliRuntimeFoundation = CliRenderer | Verbosity;

const defaultExitCodeForExpectedError = (error: ExpectedCliError): number =>
  error._tag === "PromptCancelled" ? ExitCode.Success : exitCodeFor(error.code);

const positiveNumericProperty = (properties: TelemetryProperties, key: string): boolean => {
  const value = properties[key];
  return typeof value === "number" && value > 0;
};

export const exitCodeForSemanticProperties = (
  properties: TelemetryProperties,
): number | undefined =>
  positiveNumericProperty(properties, "cli.failed_count") ||
  positiveNumericProperty(properties, "cli.blocked_count")
    ? ExitCode.Issues
    : undefined;

/**
 * Emit an expected (handled) CLI error.
 *
 * Rendering is delegated to `renderAppErrorChannels` — the single source of
 * truth shared with the outer `classifyError`/`handleError` path — so the two
 * error paths cannot diverge. Suggestions appear once per channel: a single
 * `Next:` block in text mode, and the stderr suggestion stream plus the
 * stdout envelope (distinct surfaces) in json mode. The earlier bug emitted a
 * second `Next:` block on the same stderr channel in text mode.
 *
 * Exported for tests; production callers route through `withCliErrorHandling`.
 */
export const writeExpectedCliError = (error: ExpectedCliError, format: OutputFormat) =>
  Effect.gen(function* () {
    if (error._tag === "PromptCancelled") {
      return;
    }

    const verbosityOption = yield* Effect.serviceOption(Verbosity);
    const { verbose, debug } = Option.match(verbosityOption, {
      onNone: () => ({ verbose: false, debug: false }),
      onSome: (v) => ({
        verbose: v.isAtLeast("verbose"),
        debug: v.isAtLeast("debug"),
      }),
    });

    const { stderr, stdout } = renderAppErrorChannels(error, format, { verbose, debug });

    for (const line of stderr) {
      writeStderr(line);
    }
    if (stdout !== undefined) {
      process.stdout.write(stdout);
    }
  });

// ---------------------------------------------------------------------------
// Building blocks — composable pieces callers assemble directly
// ---------------------------------------------------------------------------

/**
 * Build the foundation layer: CliRenderer + Verbosity.
 *
 * The returned layer requires the global verbosity flag settings in its
 * context when no explicit verbosity level is supplied.
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
  const rendererLayer =
    format !== "text"
      ? MachineRenderer()
      : Layer.unwrap(
          Effect.gen(function* () {
            const quiet =
              options?.verbosityLevel === undefined
                ? yield* quietFlag
                : options.verbosityLevel === "quiet";
            return InteractiveRenderer({
              outputPolicy: resolveCliOutputPolicy({ quiet }),
            });
          }),
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

          const level: VerbosityLevel = flagQuiet
            ? "quiet"
            : flagDebug || envDebug
              ? "debug"
              : flagVerbose || envVerbose
                ? "verbose"
                : "normal";

          return makeVerbosityLayer(level);
        }),
      );

  return Layer.mergeAll(rendererLayer, verbosityLayer);
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
    const allProperties = {
      ...argvProperties,
      ...globalProperties,
    };

    // Fire command_invoked
    yield* trackCliCommand({ command, properties: allProperties });

    // Execute program with timing
    const startTime = yield* Clock.currentTimeMillis;

    return yield* program.pipe(
      Effect.tap(() =>
        Effect.gen(function* () {
          const semanticProperties = yield* getCommandSemanticProperties;
          const semanticExitCode = exitCodeForSemanticProperties(semanticProperties);
          yield* trackCliCommandCompleted({
            command,
            result: semanticExitCode === undefined ? "success" : "error",
            durationMs: (yield* Clock.currentTimeMillis) - startTime,
            ...(semanticExitCode !== undefined && {
              errorCode: "issues",
              errorCategory: "issues",
            }),
            semanticProperties,
          });
          if (semanticExitCode !== undefined) {
            return yield* Effect.die(effectCliExit(semanticExitCode));
          }
        }),
      ),
      Effect.catch((error: ExpectedCliError) => {
        const exitCode = defaultExitCodeForExpectedError(error);
        const result = error._tag === "PromptCancelled" ? "cancelled" : "error";

        return writeExpectedCliError(error, options.format).pipe(
          Effect.andThen(reportCliError(error, command)),
          Effect.andThen(
            Effect.gen(function* () {
              const semanticProperties = yield* getCommandSemanticProperties;
              yield* trackCliCommandCompleted({
                command,
                result,
                durationMs: (yield* Clock.currentTimeMillis) - startTime,
                ...(error._tag === "AppError" && {
                  errorCode: error.code,
                  errorCategory: error.code,
                }),
                semanticProperties,
              });
            }),
          ),
          Effect.andThen(Effect.die(effectCliExit(exitCode))),
        );
      }),
      Effect.catchCause((cause) => {
        const defect = Cause.squash(cause);
        if (isEffectCliExit(defect)) {
          return Effect.failCause(cause);
        }
        if (Cause.hasInterruptsOnly(cause)) {
          return Effect.failCause(cause);
        }

        return Effect.sync(() => writeDefect(cause, options.format)).pipe(
          Effect.andThen(reportCliDefect(cause, command)),
          Effect.andThen(
            Effect.gen(function* () {
              const semanticProperties = yield* getCommandSemanticProperties;
              yield* trackCliCommandCompleted({
                command,
                result: "defect",
                durationMs: (yield* Clock.currentTimeMillis) - startTime,
                semanticProperties,
              });
            }),
          ),
          Effect.andThen(Effect.die(effectCliExit(ExitCode.Internal))),
        );
      }),
    );
  });

  return enrichedProgram.pipe(
    Effect.provide(Layer.mergeAll(telemetryLayer, CommandSemanticPropertiesLive)),
  );
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

    return yield* withCliErrorHandling(program, {
      command: options.command,
      format,
      telemetryConfig: options.telemetryConfig,
    }).pipe(Effect.provide(foundationLayer), Effect.scoped);
  });
