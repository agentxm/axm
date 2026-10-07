import { appErrorWithDiagnostic } from "./terminal-diagnostics.js";
import { FailureOperation } from "@agentxm/workspace-kernel/operations";
import * as Context from "effect/Context";
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Ref from "effect/Ref";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { jsonFlag, debugFlag, verboseFlag, quietFlag } from "../cli-flags/index.js";
import type { OutputFormat } from "./output-mode.js";
import type { AppErrorCode } from "../app-error/index.js";
import { AppError, ExitCode, exitCodeFor } from "../app-error/index.js";
import { isWorkspaceFailure, type WorkspaceFailure } from "../app-error/failure-catalog.js";
import { failureToAppError, toAppError } from "../app-error/conversions.js";
import type { InstallSelectionCancelled } from "@agentxm/workspace-kernel/operations";

/**
 * Structural shape of the workspace configuration feature's typed
 * initialization cancellation. The envelope dispatches on the tag alone, so
 * it does not import the feature package (the transitional residue may not
 * depend on features).
 */
export interface WorkspaceInitializationCancelled {
  readonly _tag: "WorkspaceInitializationCancelled";
  readonly message: string;
}
import { renderAppErrorChannels } from "./handle-error.js";
import { processOutcome, isProcessOutcome } from "./process-outcome.js";
import { resolveFormat } from "./resolve-format.js";
import {
  OperationExit,
  getOperationExitCode,
  getOperationSettlement,
  type OperationSettlement,
} from "./operation-exit.js";
import { CommandCompletion } from "./command-completion.js";
import {
  readGlobalFlagProperties,
  recordCommandSettlement,
  trackCliCommand,
  getCommandSemanticProperties,
  CommandSemanticPropertiesLive,
  ProductActivityLive,
  type CommandSettlement,
  type CommandSettlementFailure,
} from "./telemetry.js";
import {
  causeCarriesOutputFailure,
  causeDefect,
  defectIdentity,
  handledFailureIdentity,
} from "./failure-identity.js";
import {
  ConfigurationFailure,
  recordedConfigurationFailure,
  type ConfigurationFailureRecord,
} from "./configuration-failure.js";
import { CommandArgv, serializeArgv } from "./command-argv.js";
import { TelemetryPreviewFraming } from "../telemetry/index.js";

import {
  InteractiveScreen,
  MachineScreen,
  resolveCliOutputPolicy,
  type QuestionCancelled,
  OutputWriteFailed,
} from "../screen/index.js";
import {
  makeVerbosityLayer,
  resolveVerbosityLevel,
  Verbosity,
  type VerbosityLevel,
} from "../cli-flags/index.js";
import { Screen } from "../screen/index.js";
import { ScreenLogDrain } from "../screen/logger.js";

/**
 * Emit a defect (unhandled panic). The squashed cause classifies through the
 * one failure classifier and renders through the one error renderer, so a
 * defect reads exactly like any other error of its code on every channel: the
 * same title, the same `--debug` cause chain in text, the same stable
 * envelope in JSON. The classification is handed back so the process exits
 * with the code the rendered phrase states.
 */
export const writeDefect = (cause: Cause.Cause<unknown>, format: OutputFormat) => {
  const defect = failureToAppError(Cause.squash(cause));
  return writeExpectedCliError(defect, format).pipe(Effect.as(defect));
};

export type ExpectedCliError =
  | OutputWriteFailed
  | AppError
  | WorkspaceFailure
  | QuestionCancelled
  | WorkspaceInitializationCancelled
  | InstallSelectionCancelled;
export type CliRuntimeFoundation = Screen | Verbosity;

/**
 * Resolve the AppError rendering for an expected error. Known typed failures
 * convert through the application-error boundary; cancellation tags
 * (QuestionCancelled, WorkspaceInitializationCancelled, InstallSelectionCancelled)
 * resolve to none and exit successfully.
 */
const expectedErrorToAppError = (error: ExpectedCliError): AppError | undefined =>
  error instanceof AppError ? error : isWorkspaceFailure(error) ? toAppError(error) : undefined;

const elapsedMilliseconds = (start: bigint, end: bigint): number =>
  Duration.toMillis(Duration.nanos(end - start));

/** A failed returned result must carry its producer's diagnostic. */
const settlementForExit = (
  exitCode: number,
  recorded: Option.Option<OperationSettlement>,
): Pick<CommandSettlement, "result" | "failure"> => {
  if (exitCode === 130 || exitCode === 143) return { result: "cancelled" };
  if (exitCode === ExitCode.Success) return { result: "success" };
  return {
    result: "error",
    failure:
      Option.isSome(recorded) && recorded.value.failure !== undefined
        ? recorded.value.failure
        : {
            code: "internal",
            phase: "command",
            kind: "diagnostic.unclassified",
            operation: "runtime.command",
            handled: true,
          },
  };
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

    const { stderr, stderrDoc, stdout } = renderAppErrorChannels(resolved, format, {
      verbose,
      debug,
    });
    const screen = yield* Screen;

    if (stderrDoc !== undefined) {
      yield* screen.note(stderrDoc);
    } else {
      for (const line of stderr) {
        yield* screen.note([{ _tag: "raw", content: line.endsWith("\n") ? line : `${line}\n` }]);
      }
    }
    if (stdout !== undefined) {
      yield* screen.result([{ _tag: "raw", content: stdout }]);
    }
  });

// ---------------------------------------------------------------------------
// Building blocks — composable pieces callers assemble directly
// ---------------------------------------------------------------------------

/**
 * Build the foundation layer: Screen + Verbosity.
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
        return MachineScreen({ quiet });
      }
      const outputPolicy = resolveCliOutputPolicy({ quiet });
      return InteractiveScreen({ outputPolicy });
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

          return makeVerbosityLayer(
            resolveVerbosityLevel({ flagQuiet, flagDebug, flagVerbose, envDebug, envVerbose }),
          );
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
 * Wrap a pre-provided program in CLI error handling and settlement telemetry.
 *
 * The program should already have all its service dependencies satisfied
 * except for the process-owned TelemetryClient, which the envelope requires
 * from its caller so one reporter serves the whole invocation.
 */
export const withCliErrorHandling = <A, R>(
  program: Effect.Effect<A, ExpectedCliError, R>,
  options: {
    readonly command?: string | undefined;
    readonly format: OutputFormat;
  },
) => {
  const command = options.command ?? "unknown";

  const enrichedProgram = Effect.gen(function* () {
    // Collection is an observation boundary too: a faulty collector cannot
    // prevent the requested command from starting.
    yield* Effect.gen(function* () {
      const argvOption = yield* Effect.serviceOption(CommandArgv);
      const argvProperties = Option.match(argvOption, {
        onNone: () => ({}),
        onSome: (argv) => serializeArgv(argv.value, argv.paramKinds),
      });
      const globalProperties = yield* readGlobalFlagProperties;
      yield* trackCliCommand({ command, properties: { ...argvProperties, ...globalProperties } });
    }).pipe(Effect.catchCause(() => Effect.void));

    // Execute program with timing
    const startTime = yield* Clock.monotonicTimeNanos;
    // Settlement is recorded exactly once, whichever termination path runs.
    const settled = yield* Ref.make(false);
    const settle = (settlement: Pick<CommandSettlement, "result" | "failure">) =>
      Effect.gen(function* () {
        if (yield* Ref.getAndSet(settled, true)) return;
        const semanticProperties = yield* getCommandSemanticProperties;
        yield* recordCommandSettlement({
          ...(options.command === undefined ? {} : { command: options.command }),
          ...settlement,
          durationMs: elapsedMilliseconds(startTime, yield* Clock.monotonicTimeNanos),
          semanticProperties,
        });
      });
    // Operation boundaries that finish inside an uninterruptible region settle
    // through this hook, before the pending interrupt can fire at the
    // envelope's own continuation boundary.
    const settleForExit = (exitCode: number) =>
      Effect.gen(function* () {
        yield* settle(settlementForExit(exitCode, yield* getOperationSettlement));
      });

    const settleOutput = Effect.gen(function* () {
      const logDrain = yield* Effect.serviceOption(ScreenLogDrain);
      if (Option.isSome(logDrain)) yield* logDrain.value.drain;
      const screen = yield* Screen;
      yield* screen.settle;
    });

    // Undelivered output settles as an internal failure of the output phase.
    const settleOutputFailure = (error: OutputWriteFailed) =>
      settle({
        result: "error",
        failure: { ...handledFailureIdentity(error), phase: "output" },
      }).pipe(Effect.as(processOutcome(ExitCode.Internal)));

    // A failure raised while building the command's workspace settles in the
    // configuration phase, under the identity the workspace boundary recorded
    // before converting it; anything the command itself raised settles in the
    // command phase.
    const configurationFailures = yield* Ref.make(Option.none<ConfigurationFailureRecord>());
    const commandFailure = (error: ExpectedCliError): Effect.Effect<CommandSettlementFailure> =>
      Effect.map(
        recordedConfigurationFailure(configurationFailures, error),
        Option.match({
          onNone: (): CommandSettlementFailure => ({
            ...handledFailureIdentity(error),
            phase: "command",
          }),
          onSome: (identity): CommandSettlementFailure => ({ ...identity, phase: "configuration" }),
        }),
      );
    const defectFailure = (
      cause: Cause.Cause<unknown>,
      code: AppErrorCode,
    ): Effect.Effect<CommandSettlementFailure> => {
      const defect = causeDefect(cause);
      return Effect.map(
        recordedConfigurationFailure(configurationFailures, defect),
        (configuration): CommandSettlementFailure => ({
          ...defectIdentity(defect),
          operation:
            cause.reasons
              .map((reason) =>
                Context.getOrUndefined(Cause.reasonAnnotations(reason), FailureOperation),
              )
              .find((value) => value !== undefined) ?? "runtime.command",
          code,
          phase: causeCarriesOutputFailure(cause)
            ? "output"
            : Option.isSome(configuration)
              ? "configuration"
              : "command",
        }),
      );
    };

    return yield* program.pipe(
      Effect.provideService(CommandCompletion, { record: settleForExit }),
      Effect.provideService(ConfigurationFailure, { ref: configurationFailures }),
      Effect.tap(() => settleOutput),
      Effect.flatMap((value) =>
        Effect.gen(function* () {
          // A returned outcome states its exit; an operation resolution's own
          // exit mapping recorded the code; anything else ended successfully.
          const exitCode = isProcessOutcome(value)
            ? value.exitCode
            : Option.getOrElse(yield* getOperationExitCode, () => ExitCode.Success);
          yield* settleForExit(exitCode);
          return processOutcome(exitCode);
        }),
      ),
      Effect.catch((error: ExpectedCliError) => {
        if (error instanceof OutputWriteFailed) return settleOutputFailure(error);
        const resolved = expectedErrorToAppError(error);
        const exitCode = resolved === undefined ? ExitCode.Success : exitCodeFor(resolved.code);

        return Effect.gen(function* () {
          if (resolved === undefined) {
            yield* writeExpectedCliError(error, options.format);
            return;
          }
          const failure = yield* commandFailure(error);
          const rendered = yield* appErrorWithDiagnostic(resolved, failure, options.command);
          yield* writeExpectedCliError(rendered, options.format);
        }).pipe(
          // An owned failure may already include an output failure and its
          // compensation (for example, revoking an undelivered token). Once
          // its diagnostic is delivered, retain that failure's exit code when
          // settlement sees the cached channel failure again. Success and
          // cancellation must still fail if their output was not delivered.
          Effect.andThen(
            exitCode === ExitCode.Success
              ? settleOutput
              : settleOutput.pipe(Effect.catchTag("OutputWriteFailed", () => Effect.void)),
          ),
          Effect.andThen(
            resolved === undefined
              ? settle({ result: "cancelled" })
              : Effect.flatMap(commandFailure(error), (failure) =>
                  settle({ result: "error", failure }),
                ),
          ),
          Effect.as(processOutcome(exitCode)),
        );
      }),
      Effect.catchCause((cause) => {
        const failure = Cause.findErrorOption(cause);
        if (
          !Cause.hasDies(cause) &&
          Option.isSome(failure) &&
          failure.value instanceof OutputWriteFailed
        ) {
          return settleOutputFailure(failure.value);
        }
        // An interruption is never a defect: it continues to the process
        // owner, which reports the signal's exit.
        if (Cause.hasInterruptsOnly(cause)) {
          return Effect.failCause(cause);
        }

        return Effect.gen(function* () {
          const defect = failureToAppError(Cause.squash(cause));
          const failure = yield* defectFailure(cause, defect.code);
          const rendered = yield* appErrorWithDiagnostic(defect, failure, options.command);
          yield* writeExpectedCliError(rendered, options.format);
          return defect;
        }).pipe(
          Effect.flatMap((defect) =>
            settleOutput.pipe(
              Effect.andThen(
                Effect.flatMap(defectFailure(cause, defect.code), (failure) =>
                  settle({ result: "defect", failure }),
                ),
              ),
              Effect.as(processOutcome(exitCodeFor(defect.code))),
            ),
          ),
        );
      }),
    );
  });

  return Effect.gen(function* () {
    const inherited = yield* Effect.serviceOption(OperationExit);
    const operationExit = Option.isSome(inherited)
      ? inherited.value
      : { ref: yield* Ref.make(Option.none<OperationSettlement>()) };
    const outcome = yield* enrichedProgram.pipe(
      Effect.provide(Layer.mergeAll(CommandSemanticPropertiesLive, ProductActivityLive)),
      Effect.provideService(OperationExit, operationExit),
      // Telemetry previewed while the command runs joins its Screen's stderr.
      Effect.provideService(TelemetryPreviewFraming, options.format),
    );
    const recorded = yield* Ref.get(operationExit.ref);
    yield* Ref.set(
      operationExit.ref,
      Option.some({
        exitCode: outcome.exitCode,
        ...(Option.isSome(recorded) && recorded.value.failure !== undefined
          ? { failure: recorded.value.failure }
          : {}),
      }),
    );
    return outcome;
  });
};
