import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { InputLive, InputStructured, type Input } from "../input/index.js";
import {
  CliFlags,
  makeCliFlagsLayer,
  outputFormatFlag,
  type CliPerCommandFlags,
} from "../cli-flags/index.js";
import type { OutputFormat } from "../output-format.js";
import type { AppError } from "../app-error/index.js";
import { renderAppError, type RenderAppErrorOptions } from "../app-error/index.js";
import type { PromptCancelled } from "../prompt-cancelled.js";
import type { Activity } from "../activity/activity.js";
import type { Output } from "../output/output.js";
import { effectCliExit, isEffectCliExit } from "./effect-cli-exit.js";
import { resolveFormat } from "./resolve-format.js";
import { makeCliTelemetryLayer, type CliTelemetryConfigService } from "./telemetry-layer.js";
import { makeUiLayer } from "./ui-layer.js";
import { reportCliDefect, reportCliError, trackCliCommand } from "./telemetry.js";

export type ExpectedCliError = AppError | PromptCancelled;
export type CliRuntimeFoundation = Output | Activity | Input | CliFlags;

export interface CliRuntimeContext {
  readonly format: OutputFormat;
  readonly uiLayer: Layer.Layer<Output | Activity>;
  readonly foundationLayer: Layer.Layer<CliRuntimeFoundation, never, unknown>;
}

export interface MakeCliRuntimeContextOptions {
  readonly isLongRunning?: boolean | undefined;
  readonly ci?: boolean | undefined;
  readonly flags?: CliPerCommandFlags | undefined;
}

const defaultExitCodeForExpectedError = (error: ExpectedCliError): number =>
  error._tag === "PromptCancelled" ? 0 : 1;

const writeExpectedCliError = (
  error: ExpectedCliError,
  context: Pick<CliRuntimeContext, "format">,
  options?: {
    readonly appErrorRenderOptions?: RenderAppErrorOptions | undefined;
  },
): Effect.Effect<void> => {
  if (error._tag === "PromptCancelled") {
    return Effect.void;
  }

  return Effect.sync(() => {
    if (context.format === "text") {
      console.error(renderAppError(error, options?.appErrorRenderOptions));
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
};

export interface WithCliRuntimeEnvelopeOptions<
  ProgramLayer = Output | Activity,
  ProgramLayerError extends ExpectedCliError = never,
  ProgramContext = never,
> {
  readonly command?: string | undefined;
  readonly isLongRunning?: boolean | undefined;
  readonly telemetryConfig: CliTelemetryConfigService;
  readonly appErrorRenderOptions?: RenderAppErrorOptions | undefined;
  readonly makeProgramLayer?: (
    context: CliRuntimeContext,
  ) => Layer.Layer<ProgramLayer, ProgramLayerError, ProgramContext>;
}

export interface RunCliRuntimeOptions<
  ProgramLayer = never,
  ProgramLayerError extends ExpectedCliError = never,
  ProgramContext = never,
> {
  readonly command?: string | undefined;
  readonly runtime: CliRuntimeContext;
  readonly telemetryConfig: CliTelemetryConfigService;
  readonly appErrorRenderOptions?: RenderAppErrorOptions | undefined;
  readonly programLayer?: Layer.Layer<ProgramLayer, ProgramLayerError, ProgramContext>;
  readonly mergeFoundationLayer?: boolean | undefined;
}

export interface WithCliRuntimeOptions<
  ProgramLayer = never,
  ProgramLayerError extends ExpectedCliError = never,
> {
  readonly command?: string | undefined;
  readonly isLongRunning?: boolean | undefined;
  readonly ci?: boolean | undefined;
  readonly flags?: CliPerCommandFlags | undefined;
  readonly telemetryConfig: CliTelemetryConfigService;
  readonly appErrorRenderOptions?: RenderAppErrorOptions | undefined;
  readonly programLayer?: Layer.Layer<ProgramLayer, ProgramLayerError, CliRuntimeFoundation>;
}

export const makeCliRuntimeContext = (options?: MakeCliRuntimeContextOptions) =>
  Effect.gen(function* () {
    const explicitFormat = yield* outputFormatFlag;
    const format = resolveFormat(
      explicitFormat,
      options?.isLongRunning === undefined
        ? undefined
        : { isLongRunning: options.isLongRunning },
    );
    const cliFlagsLayer = makeCliFlagsLayer({
      ci: options?.ci,
      flags: options?.flags,
    });
    const uiLayer = makeUiLayer(format);
    const inputLayer =
      format === "text" ? Layer.provide(InputLive, cliFlagsLayer) : InputStructured;

    return {
      format,
      uiLayer,
      foundationLayer: Layer.mergeAll(uiLayer, cliFlagsLayer, inputLayer),
    } satisfies CliRuntimeContext;
  });

export function runCliRuntime<
  A,
  RootContext = never,
  ProgramLayer = never,
  ProgramLayerError extends ExpectedCliError = never,
>(
  program: Effect.Effect<A, ExpectedCliError, CliRuntimeFoundation | ProgramLayer | RootContext>,
  options: RunCliRuntimeOptions<ProgramLayer, ProgramLayerError, CliRuntimeFoundation>,
): Effect.Effect<A, unknown, RootContext>;
export function runCliRuntime<
  A,
  R,
  ProgramLayer = never,
  ProgramLayerError extends ExpectedCliError = never,
  ProgramContext = never,
>(
  program: Effect.Effect<A, ExpectedCliError, R>,
  options: RunCliRuntimeOptions<ProgramLayer, ProgramLayerError, ProgramContext>,
): Effect.Effect<A, unknown, unknown>;
export function runCliRuntime<
  A,
  R,
  ProgramLayer = never,
  ProgramLayerError extends ExpectedCliError = never,
  ProgramContext = never,
>(
  program: Effect.Effect<A, ExpectedCliError, R>,
  options: RunCliRuntimeOptions<ProgramLayer, ProgramLayerError, ProgramContext>,
): Effect.Effect<A, unknown, unknown> {
  const command = options.command ?? "unknown";
  const telemetryLayer = makeCliTelemetryLayer(command, options.telemetryConfig);
  const programLayer: Layer.Layer<ProgramLayer, ProgramLayerError, ProgramContext> =
    options.programLayer === undefined
      ? (options.runtime.foundationLayer as unknown as Layer.Layer<
          ProgramLayer,
          ProgramLayerError,
          ProgramContext
        >)
      : options.mergeFoundationLayer === false
        ? options.programLayer
        : (Layer.provideMerge(options.programLayer, options.runtime.foundationLayer) as Layer.Layer<
            ProgramLayer,
            ProgramLayerError,
            ProgramContext
          >);
  const runtimeProgram = trackCliCommand({ command }).pipe(Effect.andThen(program));
  const provided = runtimeProgram.pipe(Effect.provide(programLayer), Effect.scoped);

  return provided.pipe(
    Effect.catch((error: ExpectedCliError) => {
      const exitCode = defaultExitCodeForExpectedError(error);

      return writeExpectedCliError(error, { format: options.runtime.format }, {
        appErrorRenderOptions: options.appErrorRenderOptions,
      }).pipe(
        Effect.andThen(reportCliError(error, command)),
        Effect.flatMap(() => Effect.die(effectCliExit(exitCode))),
      );
    }),
    Effect.catchCause((cause) => {
      const defect = Cause.squash(cause);
      if (isEffectCliExit(defect)) {
        return Effect.failCause(cause);
      }

      return reportCliDefect(cause, command).pipe(
        Effect.andThen(Effect.failCause(cause)),
      );
    }),
    Effect.provide(telemetryLayer),
  );
}

export const withCliRuntimeEnvelope = <
  A,
  R,
  ProgramLayer = Output | Activity,
  ProgramLayerError extends ExpectedCliError = never,
  ProgramContext = never,
>(
  program: Effect.Effect<A, ExpectedCliError, R>,
  options: WithCliRuntimeEnvelopeOptions<ProgramLayer, ProgramLayerError, ProgramContext>,
): Effect.Effect<A, unknown, unknown> =>
  Effect.gen(function* () {
    const context = yield* makeCliRuntimeContext({
      isLongRunning: options.isLongRunning,
    });
    const programLayer: Layer.Layer<ProgramLayer, ProgramLayerError, ProgramContext> =
      options.makeProgramLayer?.(context) ??
      (context.uiLayer as unknown as Layer.Layer<ProgramLayer, ProgramLayerError, ProgramContext>);

    return yield* runCliRuntime(program, {
      command: options.command,
      runtime: context,
      telemetryConfig: options.telemetryConfig,
      appErrorRenderOptions: options.appErrorRenderOptions,
      programLayer,
      mergeFoundationLayer: false,
    });
  });

export const withCliRuntime = <
  A,
  R,
  ProgramLayer = never,
  ProgramLayerError extends ExpectedCliError = never,
>(
  program: Effect.Effect<A, ExpectedCliError, R>,
  options: WithCliRuntimeOptions<ProgramLayer, ProgramLayerError>,
): Effect.Effect<A, unknown, Exclude<R, CliRuntimeFoundation | ProgramLayer>> =>
  (Effect.gen(function* () {
    const runtime = yield* makeCliRuntimeContext({
      isLongRunning: options.isLongRunning,
      ci: options.ci,
      flags: options.flags,
    });

    return yield* runCliRuntime(program, {
      command: options.command,
      runtime,
      telemetryConfig: options.telemetryConfig,
      appErrorRenderOptions: options.appErrorRenderOptions,
      ...(options.programLayer !== undefined && { programLayer: options.programLayer }),
    });
  }) as Effect.Effect<A, unknown, Exclude<R, CliRuntimeFoundation | ProgramLayer>>);
