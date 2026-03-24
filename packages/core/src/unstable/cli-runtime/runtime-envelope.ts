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

interface CliRuntimeContext {
  readonly format: OutputFormat;
  readonly foundationLayer: Layer.Layer<CliRuntimeFoundation, never, unknown>;
}

interface MakeCliRuntimeContextOptions {
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

interface RunCliRuntimeOptions<
  ProgramLayer extends Layer.Any = Layer.Layer<never>,
> {
  readonly command?: string | undefined;
  readonly runtime: CliRuntimeContext;
  readonly telemetryConfig: CliTelemetryConfigService;
  readonly appErrorRenderOptions?: RenderAppErrorOptions | undefined;
  readonly programLayer?: ProgramLayer;
}

type ProgramLayerContext<ProgramLayer extends Layer.Any> = Exclude<
  Layer.Services<ProgramLayer>,
  CliRuntimeFoundation
>;

type ProgramLayerSuccess<ProgramLayer extends Layer.Any> = Layer.Success<ProgramLayer>;

export interface WithCliRuntimeOptions<ProgramLayer extends Layer.Any = Layer.Layer<never>> {
  readonly command?: string | undefined;
  readonly isLongRunning?: boolean | undefined;
  readonly ci?: boolean | undefined;
  readonly flags?: CliPerCommandFlags | undefined;
  readonly telemetryConfig: CliTelemetryConfigService;
  readonly appErrorRenderOptions?: RenderAppErrorOptions | undefined;
  readonly programLayer?: ProgramLayer;
}

const makeCliRuntimeContext = (options?: MakeCliRuntimeContextOptions) =>
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
      foundationLayer: Layer.mergeAll(uiLayer, cliFlagsLayer, inputLayer),
    } satisfies CliRuntimeContext;
  });

const runCliRuntime = <
  A,
  R,
  ProgramLayer extends Layer.Any = Layer.Layer<never>,
>(
  program: Effect.Effect<A, ExpectedCliError, R>,
  options: RunCliRuntimeOptions<ProgramLayer>,
): Effect.Effect<
  A,
  unknown,
  Exclude<R, CliRuntimeFoundation | ProgramLayerSuccess<ProgramLayer>> |
    ProgramLayerContext<ProgramLayer>
> => {
  const command = options.command ?? "unknown";
  const telemetryLayer = makeCliTelemetryLayer(command, options.telemetryConfig);
  const programLayer: Layer.Layer<
    ProgramLayerSuccess<ProgramLayer>,
    Layer.Error<ProgramLayer>,
    ProgramLayerContext<ProgramLayer>
  > =
    options.programLayer === undefined
      ? (options.runtime.foundationLayer as unknown as Layer.Layer<
          ProgramLayerSuccess<ProgramLayer>,
          Layer.Error<ProgramLayer>,
          ProgramLayerContext<ProgramLayer>
        >)
      : (Layer.provideMerge(
          options.programLayer as unknown as Layer.Layer<
            ProgramLayerSuccess<ProgramLayer>,
            Layer.Error<ProgramLayer>,
            CliRuntimeFoundation | ProgramLayerContext<ProgramLayer>
          >,
          options.runtime.foundationLayer,
        ) as unknown as Layer.Layer<
          ProgramLayerSuccess<ProgramLayer>,
          Layer.Error<ProgramLayer>,
          ProgramLayerContext<ProgramLayer>
        >);
  const runtimeProgram = trackCliCommand({ command }).pipe(Effect.andThen(program));
  const provided = runtimeProgram.pipe(
    Effect.provide(programLayer),
    Effect.scoped,
  ) as Effect.Effect<
    A,
    ExpectedCliError,
    Exclude<R, CliRuntimeFoundation | ProgramLayerSuccess<ProgramLayer>> |
      ProgramLayerContext<ProgramLayer>
  >;

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
  ) as Effect.Effect<
    A,
    unknown,
    Exclude<R, CliRuntimeFoundation | ProgramLayerSuccess<ProgramLayer>> |
      ProgramLayerContext<ProgramLayer>
  >;
};

export const withCliRuntime = <
  A,
  R,
  ProgramLayer extends Layer.Any = Layer.Layer<never>,
>(
  program: Effect.Effect<A, ExpectedCliError, R>,
  options: WithCliRuntimeOptions<ProgramLayer>,
): Effect.Effect<
  A,
  unknown,
  Exclude<R, CliRuntimeFoundation | ProgramLayerSuccess<ProgramLayer>> |
    ProgramLayerContext<ProgramLayer>
> =>
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
  }) as Effect.Effect<
    A,
    unknown,
    Exclude<R, CliRuntimeFoundation | ProgramLayerSuccess<ProgramLayer>> |
      ProgramLayerContext<ProgramLayer>
  >);
