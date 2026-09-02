import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Ref from "effect/Ref";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { jsonFlag, debugFlag, verboseFlag, quietFlag } from "../cli-flags/index.js";
import type { OutputFormat } from "./output-mode.js";
import { makeErrorEvent } from "./output-mode.js";
import type { AppError } from "../app-error/index.js";
import { AppErrorCodes, ExitCode, exitCodeFor, redactSensitiveText } from "../app-error/index.js";
import { isKnownFailure, toAppError, type KnownFailure } from "../app-error/conversions.js";
import type { PromptCancelled } from "../prompt/prompt-cancelled.js";

/**
 * Structural shape of the workspace-configuration feature's typed
 * initialization cancellation. The envelope dispatches on the tag alone, so
 * it does not import the feature package (the transitional residue may not
 * depend on features).
 */
export interface WorkspaceInitializationCancelled {
  readonly _tag: "WorkspaceInitializationCancelled";
  readonly message: string;
}
import { renderAppErrorChannels } from "./handle-error.js";
import { effectCliExit, isEffectCliExit } from "./effect-cli-exit.js";
import { resolveFormat } from "./resolve-format.js";
import { OperationExitLive, getOperationExitCode } from "./operation-exit.js";
import { CommandCompletion } from "./command-completion.js";
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
import {
  TelemetryClientLive,
  type TelemetryClientOptions,
  type TelemetryProperties,
} from "../telemetry/index.js";

import {
  InteractiveRenderer,
  MachineRenderer,
  resolveCliOutputPolicy,
  type CliRenderer,
} from "../cli-renderer/index.js";
import { makeVerbosityLayer, Verbosity, type VerbosityLevel } from "../cli-flags/index.js";
import { makeJsonErrorEnvelope } from "./json-envelope.js";
import { type Screen } from "../screen/index.js";

const writeStderr = (message: string): void => {
  process.stderr.write(message.endsWith("\n") ? message : `${message}\n`);
};

export interface CliTelemetryConfig {
  readonly mode: TelemetryClientOptions["mode"];
  readonly client: TelemetryClientOptions["client"];
}

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

export type ExpectedCliError =
  AppError | KnownFailure | PromptCancelled | WorkspaceInitializationCancelled;
export type CliRuntimeFoundation = CliRenderer | Screen | Verbosity;

/**
 * Resolve the AppError rendering for an expected error. Known typed failures
 * convert through the application-error boundary; cancellation tags
 * (PromptCancelled, WorkspaceInitializationCancelled) resolve to none and
 * exit successfully.
 */
const expectedErrorToAppError = (error: ExpectedCliError): AppError | undefined =>
  error._tag === "AppError" ? error : isKnownFailure(error) ? toAppError(error) : undefined;

const defaultExitCodeForExpectedError = (error: ExpectedCliError): number => {
  const resolved = expectedErrorToAppError(error);
  return resolved === undefined ? ExitCode.Success : exitCodeFor(resolved.code);
};

const positiveNumericProperty = (properties: TelemetryProperties, key: string): boolean => {
  const value = properties[key];
  return typeof value === "number" && value > 0;
};

const elapsedMilliseconds = (start: bigint, end: bigint): number =>
  Duration.toMillis(Duration.nanos(end - start));

export const exitCodeForSemanticProperties = (
  properties: TelemetryProperties,
): number | undefined => {
  const reason = properties["cli.reason"];
  if (reason === "approval-required" || reason === "override-required") return ExitCode.Usage;
  if (reason === "stale-candidate") return ExitCode.Conflict;
  if (reason === "interrupted") return 130;
  if (reason === "execution-failed") return ExitCode.Issues;
  if (reason === "hard-blocked") {
    const code = properties["cli.error_code"];
    const matched = AppErrorCodes.find((candidate) => candidate === code);
    return matched === undefined ? ExitCode.Issues : exitCodeFor(matched);
  }
  return positiveNumericProperty(properties, "cli.failed_count") ||
    positiveNumericProperty(properties, "cli.blocked_count")
    ? ExitCode.Issues
    : undefined;
};

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
    const resolved = expectedErrorToAppError(error);
    if (resolved === undefined) {
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

    const { stderr, stdout } = renderAppErrorChannels(resolved, format, { verbose, debug });

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
  const outputLayer = Layer.unwrap(
    Effect.gen(function* () {
      const quiet =
        options?.verbosityLevel === undefined
          ? yield* quietFlag
          : options.verbosityLevel === "quiet";
      if (format !== "text") {
        return MachineRenderer({ quiet });
      }
      const outputPolicy = resolveCliOutputPolicy({ quiet });
      return InteractiveRenderer({ outputPolicy });
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

  return Layer.mergeAll(outputLayer, verbosityLayer);
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
    readonly telemetryConfig: CliTelemetryConfig;
  },
) => {
  const command = options.command ?? "unknown";
  const telemetryLayer = TelemetryClientLive({
    mode: options.telemetryConfig.mode,
    command,
    client: options.telemetryConfig.client,
  });

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
    const startTime = yield* Clock.monotonicTimeNanos;
    // command_completed is recorded exactly once, whichever termination path runs.
    const completionRecorded = yield* Ref.make(false);
    const semanticCause = (semanticProperties: TelemetryProperties) => {
      const code = semanticProperties["cli.error_code"];
      return typeof code === "string" ? code : undefined;
    };
    // Operation boundaries that die inside an uninterruptible region record
    // completion through this hook, before the pending interrupt can fire at
    // the envelope's own continuation boundary.
    const recordForExit = (exitCode: number) =>
      Effect.gen(function* () {
        if (yield* Ref.get(completionRecorded)) return;
        const semanticProperties = yield* getCommandSemanticProperties;
        const causeClass = semanticCause(semanticProperties);
        yield* Ref.set(completionRecorded, true);
        yield* trackCliCommandCompleted({
          command,
          result:
            exitCode === 130 || exitCode === 143
              ? "cancelled"
              : exitCode === 0
                ? "success"
                : "error",
          durationMs: elapsedMilliseconds(startTime, yield* Clock.monotonicTimeNanos),
          ...(causeClass === undefined || exitCode === 0
            ? {}
            : { errorCode: causeClass, errorCategory: causeClass }),
          semanticProperties,
        });
      });

    return yield* program.pipe(
      Effect.provideService(CommandCompletion, { record: recordForExit }),
      Effect.tap(() =>
        Effect.gen(function* () {
          const semanticProperties = yield* getCommandSemanticProperties;
          // An operation resolution's own exit mapping wins verbatim; the
          // semantic-property derivation serves only commands without one.
          const operationExit = Option.getOrUndefined(yield* getOperationExitCode);
          const semanticExitCode =
            operationExit !== undefined
              ? operationExit === 0
                ? undefined
                : operationExit
              : exitCodeForSemanticProperties(semanticProperties);
          const causeClass = semanticCause(semanticProperties);
          yield* Ref.set(completionRecorded, true);
          yield* trackCliCommandCompleted({
            command,
            result: semanticExitCode === undefined ? "success" : "error",
            durationMs: elapsedMilliseconds(startTime, yield* Clock.monotonicTimeNanos),
            ...(semanticExitCode !== undefined && {
              errorCode: causeClass ?? "issues",
              errorCategory: causeClass ?? "issues",
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
        const result = error._tag === "AppError" ? "error" : "cancelled";

        return writeExpectedCliError(error, options.format).pipe(
          Effect.andThen(reportCliError(error, command)),
          Effect.andThen(
            Effect.gen(function* () {
              const semanticProperties = yield* getCommandSemanticProperties;
              yield* Ref.set(completionRecorded, true);
              yield* trackCliCommandCompleted({
                command,
                result,
                durationMs: elapsedMilliseconds(startTime, yield* Clock.monotonicTimeNanos),
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
          // An operation boundary terminated with its own exit (blocked,
          // interrupted, contention). It already emitted its document; the
          // completion event is still owed here, once — uninterruptibly, since
          // a signal-delivered interrupt is still pending on this fiber.
          return Effect.uninterruptible(
            Effect.gen(function* () {
              if (!(yield* Ref.get(completionRecorded))) {
                const semanticProperties = yield* getCommandSemanticProperties;
                const causeClass = semanticCause(semanticProperties);
                yield* Ref.set(completionRecorded, true);
                yield* trackCliCommandCompleted({
                  command,
                  result:
                    defect.exitCode === 130 || defect.exitCode === 143 ? "cancelled" : "error",
                  durationMs: elapsedMilliseconds(startTime, yield* Clock.monotonicTimeNanos),
                  ...(causeClass === undefined
                    ? {}
                    : { errorCode: causeClass, errorCategory: causeClass }),
                  semanticProperties,
                });
              }
              return yield* Effect.failCause(cause);
            }),
          );
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
                durationMs: elapsedMilliseconds(startTime, yield* Clock.monotonicTimeNanos),
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
    Effect.provide(
      Layer.mergeAll(telemetryLayer, CommandSemanticPropertiesLive, OperationExitLive),
    ),
  );
};

// ---------------------------------------------------------------------------
// Convenience — for callers that don't need a programLayer
// ---------------------------------------------------------------------------

export interface WithCliRuntimeOptions {
  readonly command?: string | undefined;
  readonly telemetryConfig: CliTelemetryConfig;
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
