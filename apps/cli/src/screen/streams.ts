import * as Effect from "effect/Effect";
import * as Data from "effect/Data";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as ServiceMap from "effect/Context";
import * as Stream from "effect/Stream";

import type { TerminalSize } from "./scene.js";

const DEFAULT_COLUMNS = 80;
const DEFAULT_ROWS = 24;

export class CredentialDeliveryFailed extends Data.TaggedError("CredentialDeliveryFailed")<{
  readonly cause: unknown;
}> {}

const write = (stream: NodeJS.WriteStream, content: string): Effect.Effect<void> =>
  Effect.callback<void>((resume) => {
    let resumed = false;
    const complete = (error?: Error | null) => {
      if (resumed) return;
      resumed = true;
      resume(error === undefined || error === null ? Effect.void : Effect.die(error));
    };
    const accepted = stream.write(content, complete);
    if (accepted) complete();
  });

/**
 * Write a credential and succeed only when the stream reports it written.
 *
 * `write()` returning true is backpressure advice, not delivery, so only the
 * callback settles. A synchronous throw, an `error` event, or a callback error
 * fails typed; the error value never carries the content.
 *
 * Node reports a failed write to the callback first and emits `error` a tick
 * later, so a failed write keeps its listener: releasing it would turn that
 * event into an uncaught exception before the caller can compensate.
 */
const writeCredential = (
  stream: NodeJS.WriteStream,
  content: string,
): Effect.Effect<void, CredentialDeliveryFailed> =>
  Effect.callback<void, CredentialDeliveryFailed>((resume) => {
    let settled = false;
    const settle = (cause?: unknown) => {
      if (settled) return;
      settled = true;
      if (cause === undefined || cause === null) {
        stream.off("error", settle);
        resume(Effect.void);
        return;
      }
      resume(Effect.fail(new CredentialDeliveryFailed({ cause })));
    };
    stream.on("error", settle);
    if (stream.destroyed || stream.writableEnded) {
      settle(new Error("stdout is closed"));
      return;
    }
    try {
      stream.write(content, (error) => settle(error ?? undefined));
    } catch (cause) {
      settle(cause);
    }
    return Effect.sync(() => stream.off("error", settle));
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
    readonly stdout: (content: string) => Effect.Effect<void>;
    readonly stderr: (content: string) => Effect.Effect<void>;
    /** Write a credential and acknowledge the stream callback before succeeding. */
    readonly credential: (content: string) => Effect.Effect<void, CredentialDeliveryFailed>;
    readonly facts: Effect.Effect<OutputStreamFacts>;
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

export const OutputStreamsLive: Layer.Layer<OutputStreams> = Layer.succeed(OutputStreams, {
  stdout: (content) => write(process.stdout, content),
  stderr: (content) => write(process.stderr, content),
  credential: (content) => writeCredential(process.stdout, content),
  facts: Effect.sync(() => ({
    stdoutColumns: Math.max(1, process.stdout.columns ?? DEFAULT_COLUMNS),
    stdoutIsTTY: process.stdout.isTTY === true,
    stderrIsTTY: process.stderr.isTTY === true,
    columns: currentColumns(),
    rows: currentRows(),
  })),
  resize: resizeStream,
});

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
