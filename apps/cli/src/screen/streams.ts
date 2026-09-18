import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as ServiceMap from "effect/Context";
import * as Stream from "effect/Stream";

import type { TerminalSize } from "./scene.js";

const DEFAULT_COLUMNS = 80;
const DEFAULT_ROWS = 24;

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

export interface OutputStreamFacts extends TerminalSize {
  readonly stdoutIsTTY: boolean;
  readonly stderrIsTTY: boolean;
}

export class OutputStreams extends ServiceMap.Service<
  OutputStreams,
  {
    readonly stdout: (content: string) => Effect.Effect<void>;
    readonly stderr: (content: string) => Effect.Effect<void>;
    readonly facts: Effect.Effect<OutputStreamFacts>;
    readonly resize: Stream.Stream<number>;
  }
>()("axm.sh/screen/OutputStreams") {}

const currentColumns = (): number =>
  Math.max(20, process.stderr.columns ?? process.stdout.columns ?? DEFAULT_COLUMNS);

/** The floor keeps a live region of at least one row above the rows it leaves free. */
const currentRows = (): number =>
  Math.max(4, process.stderr.rows ?? process.stdout.rows ?? DEFAULT_ROWS);

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
  facts: Effect.sync(() => ({
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
      facts: Effect.sync(() => ({
        stdoutIsTTY: options?.stdoutIsTTY ?? false,
        stderrIsTTY: options?.stderrIsTTY ?? false,
        columns: state.size.columns,
        rows: state.size.rows,
      })),
      resize: options?.resize ?? Stream.empty,
    }),
  };
};
