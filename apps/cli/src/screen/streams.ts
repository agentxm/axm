import * as Effect from "effect/Effect";
import * as Data from "effect/Data";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as ServiceMap from "effect/Context";
import * as Stream from "effect/Stream";

import type { TerminalSize } from "./scene.js";

const DEFAULT_COLUMNS = 80;
const DEFAULT_ROWS = 24;

export class CredentialDeliveryFailed extends Data.TaggedError("CredentialDeliveryFailed")<{
  readonly cause: unknown;
}> {}

export class OutputWriteFailed extends Data.TaggedError("OutputWriteFailed")<{
  readonly channel: "stdout" | "stderr";
  readonly reason: string;
}> {}

interface WritableOutput {
  readonly write: (content: string, callback: (error?: Error | null) => void) => boolean;
  readonly on: (event: "error", listener: (cause: unknown) => void) => unknown;
  readonly off: (event: "error", listener: (cause: unknown) => void) => unknown;
  readonly once: (event: "error", listener: (cause: unknown) => void) => unknown;
  readonly destroyed: boolean;
  readonly writableEnded: boolean;
}

const writeFailure = (channel: "stdout" | "stderr", cause: unknown) => {
  const code =
    typeof cause === "object" && cause !== null && "code" in cause ? cause.code : undefined;
  const reason =
    typeof code === "string" &&
    ["EPIPE", "EIO", "EBADF", "ERR_STREAM_DESTROYED", "ERR_STREAM_WRITE_AFTER_END"].includes(code)
      ? code
      : "Unknown";
  return new OutputWriteFailed({ channel, reason });
};

/** Node's write return value controls backpressure; its callback acknowledges delivery. */
export const writeOutput = (
  stream: WritableOutput,
  channel: "stdout" | "stderr",
  content: string,
): Effect.Effect<void, OutputWriteFailed> =>
  Effect.callback<void, OutputWriteFailed>((resume) => {
    let settled = false;
    const cleanup = () => stream.off("error", onError);
    const complete = (cause?: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      resume(
        cause === undefined || cause === null
          ? Effect.void
          : Effect.fail(writeFailure(channel, cause)),
      );
    };
    const onError = (cause: unknown) => complete(cause);
    stream.on("error", onError);
    if (stream.destroyed || stream.writableEnded) {
      complete({ code: "ERR_STREAM_DESTROYED" });
      return;
    }
    try {
      stream.write(content, (error) => {
        if (error !== undefined && error !== null) {
          // Node calls the write callback before emitting its corresponding error.
          // Own that trailing event even after cancellation. The guard is
          // removed after this turn if no error event consumes it first.
          const trailingError = () => undefined;
          stream.once("error", trailingError);
          setImmediate(() => stream.off("error", trailingError));
        }
        complete(error);
      });
    } catch (cause) {
      complete(cause);
    }
    return Effect.sync(() => {
      settled = true;
      cleanup();
    });
  });

export interface OutputStreamFacts extends TerminalSize {
  /** Result layout follows stdout even when it is a different terminal. */
  readonly stdoutColumns: number;
  readonly stdoutIsTTY: boolean;
  readonly stderrIsTTY: boolean;
}

export class OutputStreams extends ServiceMap.Service<
  OutputStreams,
  {
    readonly stdout: (content: string) => Effect.Effect<void, OutputWriteFailed>;
    readonly stderr: (content: string) => Effect.Effect<void, OutputWriteFailed>;
    /** Write a credential and acknowledge the stream callback before succeeding. */
    readonly credential: (content: string) => Effect.Effect<void, CredentialDeliveryFailed>;
    readonly facts: Effect.Effect<OutputStreamFacts>;
    /** Re-raise a failed channel before the invocation reports completion. */
    readonly check: Effect.Effect<void, OutputWriteFailed>;
    readonly resize: Stream.Stream<number>;
  }
>()("axm.sh/screen/OutputStreams") {}

const currentColumns = (): number => Math.max(1, process.stderr.columns ?? DEFAULT_COLUMNS);

/** Preserve tiny viewport facts so unusable interaction can fail explicitly. */
const currentRows = (): number => Math.max(1, process.stderr.rows ?? DEFAULT_ROWS);

const resizeStream = Stream.callback<number>((queue) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const handler = () => Queue.offerUnsafe(queue, currentColumns());
      process.stderr.on("resize", handler);
      process.stdout.on("resize", handler);
      return handler;
    }),
    (handler) =>
      Effect.sync(() => {
        process.stderr.off("resize", handler);
        process.stdout.off("resize", handler);
      }),
  ),
);

export const OutputStreamsLive: Layer.Layer<OutputStreams> = Layer.effect(
  OutputStreams,
  Effect.gen(function* () {
    const stdoutFailure = yield* Ref.make(Option.none<OutputWriteFailed>());
    const stderrFailure = yield* Ref.make(Option.none<OutputWriteFailed>());
    const writer =
      (
        stream: WritableOutput,
        channel: "stdout" | "stderr",
        failure: Ref.Ref<Option.Option<OutputWriteFailed>>,
      ) =>
      (content: string) =>
        Effect.gen(function* () {
          const failed = yield* Ref.get(failure);
          if (Option.isSome(failed)) return yield* failed.value;
          return yield* writeOutput(stream, channel, content).pipe(
            Effect.tapError((error) => Ref.set(failure, Option.some(error))),
          );
        });
    const stdout = writer(process.stdout, "stdout", stdoutFailure);
    const stderr = writer(process.stderr, "stderr", stderrFailure);
    return {
      stdout,
      stderr,
      credential: (content) =>
        stdout(content).pipe(Effect.mapError((cause) => new CredentialDeliveryFailed({ cause }))),
      check: Effect.gen(function* () {
        const failed = yield* Ref.get(stdoutFailure);
        if (Option.isSome(failed)) return yield* failed.value;
        const diagnosticFailure = yield* Ref.get(stderrFailure);
        if (Option.isSome(diagnosticFailure)) return yield* diagnosticFailure.value;
      }),
      facts: Effect.sync(() => ({
        stdoutColumns: Math.max(1, process.stdout.columns ?? DEFAULT_COLUMNS),
        stdoutIsTTY: process.stdout.isTTY === true,
        stderrIsTTY: process.stderr.isTTY === true,
        columns: currentColumns(),
        rows: currentRows(),
      })),
      resize: resizeStream,
    };
  }),
);

/** Pre-runtime TTY fact for startup policy without exposing Node streams. */
export const stderrIsTTY = (): boolean => process.stderr.isTTY === true;

export interface TestOutputStreamsState {
  readonly stdout: Array<string>;
  readonly stderr: Array<string>;
  /** The terminal the streams report. A test narrows it, then offers a resize. */
  size: TerminalSize;
}

export const makeTestOutputStreams = (options?: {
  readonly stdoutIsTTY?: boolean;
  readonly stderrIsTTY?: boolean;
  readonly columns?: number;
  readonly stdoutColumns?: number;
  readonly rows?: number;
  readonly resize?: Stream.Stream<number>;
}): { readonly layer: Layer.Layer<OutputStreams>; readonly state: TestOutputStreamsState } => {
  const state: TestOutputStreamsState = {
    stdout: [],
    stderr: [],
    size: { columns: options?.columns ?? DEFAULT_COLUMNS, rows: options?.rows ?? DEFAULT_ROWS },
  };
  return {
    state,
    layer: Layer.succeed(OutputStreams, {
      stdout: (content) => Effect.sync(() => void state.stdout.push(content)),
      stderr: (content) => Effect.sync(() => void state.stderr.push(content)),
      credential: (content) => Effect.sync(() => void state.stdout.push(content)),
      check: Effect.void,
      facts: Effect.sync(() => ({
        stdoutColumns: options?.stdoutColumns ?? state.size.columns,
        stdoutIsTTY: options?.stdoutIsTTY ?? false,
        stderrIsTTY: options?.stderrIsTTY ?? false,
        columns: state.size.columns,
        rows: state.size.rows,
      })),
      resize: options?.resize ?? Stream.empty,
    }),
  };
};
