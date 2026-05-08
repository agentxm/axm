import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { jsonFlag, debugFlag, verboseFlag, quietFlag } from "../cli-flags/index.js";
import type { OutputFormat } from "./output-mode.js";
import type { AppError } from "../app-error/index.js";
import { exitCodeForCategory, renderAppError } from "../app-error/index.js";
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
  getCommandSemanticProperties,
  CommandSemanticPropertiesLive,
} from "./telemetry.js";
import { CommandArgv, serializeArgv } from "./command-argv.js";

import { InteractiveRenderer, MachineRenderer, type CliRenderer } from "../cli-renderer/index.js";
import { makeVerbosityLayer, Verbosity, type VerbosityLevel } from "../cli-flags/index.js";
import { makeJsonErrorEnvelopeFromAppError } from "./json-envelope.js";
import type { Breadcrumb } from "./breadcrumb.js";

const writeStderr = (message: string): void => {
  process.stderr.write(message.endsWith("\n") ? message : `${message}\n`);
};

const formatBreadcrumbCommand = (command: ReadonlyArray<string>): string => command.join(" ");
const formatBreadcrumbAction = (crumb: Breadcrumb): string => {
  if (crumb.command !== undefined) {
    return ` · ${formatBreadcrumbCommand(crumb.command)}`;
  }
  if (crumb.cmd !== undefined) {
    return ` · ${crumb.cmd}`;
  }
  return "";
};

const writeTextBreadcrumbs = (breadcrumbs: ReadonlyArray<Breadcrumb>): void => {
  if (breadcrumbs.length === 0) {
    return;
  }

  writeStderr(
    [
      "Next:",
      ...breadcrumbs.map((crumb) => {
        return `  ${crumb.description}${formatBreadcrumbAction(crumb)}`;
      }),
    ].join("\n"),
  );
};

const writeMachineBreadcrumbs = (breadcrumbs: ReadonlyArray<Breadcrumb>): void => {
  for (const crumb of breadcrumbs) {
    writeStderr(
      JSON.stringify({
        type: "breadcrumb",
        task: crumb.task,
        description: crumb.description,
        ...(crumb.command !== undefined ? { command: [...crumb.command] } : {}),
        ...(crumb.cmd !== undefined ? { cmd: crumb.cmd } : {}),
      }),
    );
  }
};

const writeMachineError = (error: AppError, exitCode: number): void => {
  writeStderr(
    JSON.stringify({
      type: "error",
      code: error.code,
      category: error.category,
      message: error.what,
      ...(error.retryable !== undefined ? { retryable: error.retryable } : {}),
      ...(error.httpStatus !== undefined ? { httpStatus: error.httpStatus } : {}),
      exitCode,
    }),
  );
};

export type ExpectedCliError = AppError | PromptCancelled;
export type CliRuntimeFoundation = CliRenderer | Verbosity;

const defaultExitCodeForExpectedError = (error: ExpectedCliError): number =>
  error._tag === "PromptCancelled" ? 0 : exitCodeForCategory(error.category);

const writeExpectedCliError = (error: ExpectedCliError, format: OutputFormat) =>
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

    if (format === "text") {
      writeStderr(renderAppError(error, { verbose, debug }));
      writeTextBreadcrumbs(error.breadcrumbs ?? []);
      return;
    }

    const exitCode = defaultExitCodeForExpectedError(error);
    writeMachineBreadcrumbs(error.breadcrumbs ?? []);
    writeMachineError(error, exitCode);
    process.stdout.write(
      JSON.stringify(makeJsonErrorEnvelopeFromAppError(error, exitCode), null, 2) + "\n",
    );
    writeStderr(`\u2717 ${error.what}`);
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
  const rendererLayer: Layer.Layer<CliRenderer> =
    format !== "text" ? MachineRenderer() : InteractiveRenderer();

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
    const startTime = Date.now();

    return yield* program.pipe(
      Effect.tap(() =>
        Effect.gen(function* () {
          const semanticProperties = yield* getCommandSemanticProperties;
          yield* trackCliCommandCompleted({
            command,
            result: "success",
            durationMs: Date.now() - startTime,
            semanticProperties,
          });
        }),
      ),
      Effect.catch((error: ExpectedCliError) => {
        const durationMs = Date.now() - startTime;
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
                durationMs,
                ...(error._tag === "AppError" && {
                  errorCode: error.code,
                  errorCategory: error.category,
                }),
                semanticProperties,
              });
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
            Effect.gen(function* () {
              const semanticProperties = yield* getCommandSemanticProperties;
              yield* trackCliCommandCompleted({
                command,
                result: "defect",
                durationMs,
                semanticProperties,
              });
            }),
          ),
          Effect.andThen(Effect.failCause(cause)),
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
    const provided = program.pipe(Effect.provide(foundationLayer), Effect.scoped);

    return yield* withCliErrorHandling(provided, {
      command: options.command,
      format,
      telemetryConfig: options.telemetryConfig,
    });
  });
